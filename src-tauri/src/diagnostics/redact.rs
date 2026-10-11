//! Scrubs secrets and personal data out of log text.
//!
//! Applied to every record the log writer receives (see `logging::RedactingWriter`) and once
//! more to every line that goes into a diagnostics export. It works on plain text and on
//! JSON-escaped text (a log line is JSON: `C:\\Users\\ana`, `\"secret\"`), never introduces
//! quotes or backslashes (so a JSON line stays valid), and is idempotent.
//!
//! What goes: the value after secret-bearing yt-dlp flags (`--video-password`, `--twofactor`,
//! `--netrc-cmd`, `--cookies`, `--password`, `--username`, `--proxy`, …), URL credentials,
//! query strings and fragments, the user's home folder (→ `~`), `Bearer`/`Basic` credentials and cookie / auth
//! headers, cookie- or token-named values (`SID=…`, `access_token=…`), Netscape cookie-jar
//! values, and long base64/hex runs (≥ 32 characters with a digit; UUIDs are kept so job ids
//! still correlate).

use regex::{Captures, Regex};
use std::sync::LazyLock;

pub const REDACTED: &str = "[redacted]";

/// yt-dlp flags whose value is a secret, a credential or a personal file path.
const SECRET_FLAGS: &str = "--video-password|--twofactor|--netrc-cmd|--netrc-location|\
--cookies-from-browser|--cookies|--password|--username|--ap-password|--ap-username|\
--client-certificate-password|--client-certificate-key|--add-headers?|--proxy|-p|-u|-2";

fn re(pattern: &str) -> Regex {
    Regex::new(pattern).expect("valid redaction pattern")
}

/// `--flag "value"` / `["--flag", "value"]` (also JSON-escaped quotes).
static FLAG_DQUOTED: LazyLock<Regex> = LazyLock::new(|| {
    re(&format!(
        r#"(?P<pre>^|[^\w-])(?P<flag>{SECRET_FLAGS})(?P<sep>(?:\\?["'])?(?:\s*[,=]\s*|\s+))(?P<q>\\?")(?:[^"\\]|\\[^"])*(?P<q2>\\?")"#
    ))
});
/// `--flag 'value'`.
static FLAG_SQUOTED: LazyLock<Regex> = LazyLock::new(|| {
    re(&format!(
        r#"(?P<pre>^|[^\w-])(?P<flag>{SECRET_FLAGS})(?P<sep>(?:\\?["'])?(?:\s*[,=]\s*|\s+))'[^'\\]*'"#
    ))
});
/// `--flag value` / `--flag=value`.
static FLAG_BARE: LazyLock<Regex> = LazyLock::new(|| {
    re(&format!(
        r#"(?P<pre>^|[^\w-])(?P<flag>{SECRET_FLAGS})(?P<sep>(?:\\?["'])?(?:\s*[,=]\s*|\s+))(?P<val>[^\s"',\]\\]+)"#
    ))
});
/// `scheme://user:pass@host`.
static URL_USERINFO: LazyLock<Regex> =
    LazyLock::new(|| re(r#"(?P<scheme>\b[a-zA-Z][a-zA-Z0-9+.-]*://)[^/\s"'<>@\\]+@"#));
/// Everything from the first `?` or `#` of a URL.
static URL_QUERY: LazyLock<Regex> =
    LazyLock::new(|| re(r#"(?P<base>\b[a-zA-Z][a-zA-Z0-9+.-]*://[^\s"'<>?#\\]*)[?#][^\s"'<>\\]*"#));
/// `C:\Users\<name>` in any form: `\`, `\\` (JSON) or `/`.
static WIN_HOME: LazyLock<Regex> = LazyLock::new(|| {
    re(
        r#"(?i)\b[a-z]:(?:\\\\|\\|/)(?:users|documents and settings)(?:\\\\|\\|/)[^\\/"'<>|:*?\r\n]+"#,
    )
});
/// `/home/<name>`, `/Users/<name>`, `/var/home/<name>`.
static UNIX_HOME: LazyLock<Regex> =
    LazyLock::new(|| re(r#"(?P<pre>^|[\s"'=(\[:,;])(?:/var)?/(?:home|Users)/[^/\s"'<>\\]+"#));
/// `Bearer xyz`, `Basic xyz`.
static AUTH_SCHEME: LazyLock<Regex> =
    LazyLock::new(|| re(r#"(?i)\b(?P<k>bearer|basic)\s+[A-Za-z0-9._~+/=-]+"#));
/// `Cookie: …`, `Authorization: …` headers (up to the end of the line / string).
static HEADERS: LazyLock<Regex> = LazyLock::new(|| {
    re(
        r#"(?i)\b(?P<k>set-cookie|cookie|authorization|proxy-authorization|x-youtube-identity-token)(?P<sep>\\?"?\s*:\s*\\?"?)[^\r\n"\\]+"#,
    )
});
/// Cookie- and token-named values: `SID=…`, `"access_token":"…"`, `password: …`.
static NAMED: LazyLock<Regex> = LazyLock::new(|| {
    re(
        r#"(?i)\b(?P<k>SID|HSID|SSID|APISID|SAPISID|__Secure-[\w-]+|__Host-[\w-]+|LOGIN_INFO|VISITOR_INFO1_LIVE|VISITOR_PRIVACY_METADATA|NID|sessionid|session_id|session_token|sessid|csrftoken|xsrf[\w-]*|access_token|refresh_token|id_token|auth_token|token|api_?key|client_secret|secret|password|passwd|pwd|sig|signature)(?P<sep>\\?"?\s*[=:]\s*\\?"?)[^\s;&"',\\]+"#,
    )
});
/// Netscape cookie-jar line: 6 tab-separated fields, then the value (raw tabs).
static JAR_LINE_RAW: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?m)(?P<head>^(?:[^\t\r\n]*\t){6})[^\t\r\n]+"));
/// The same line JSON-escaped (`\t`).
static JAR_LINE_ESCAPED: LazyLock<Regex> =
    LazyLock::new(|| re(r#"(?P<head>(?:[^\s"\\]*\\t){6})(?:[^\s"\\]|\\[^tn"])+"#));
/// Candidate secret runs; filtered in code (needs a digit, ≥ 32, not a UUID).
static LONG_RUN: LazyLock<Regex> = LazyLock::new(|| re(r"[A-Za-z0-9+_=-]{32,}"));
static UUID: LazyLock<Regex> = LazyLock::new(|| {
    re(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
});

/// This user's home folder, for homes outside the usual places (e.g. `/data/ana`).
static HOME: LazyLock<Option<String>> = LazyLock::new(|| {
    let var = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    std::env::var(var)
        .ok()
        .map(|h| h.trim_end_matches(['/', '\\']).to_string())
        .filter(|h| h.len() > 3)
});

/// Redacts `text` (see the module docs), including this user's own home folder.
pub fn redact(text: &str) -> String {
    redact_with_home(text, HOME.as_deref())
}

/// [`redact`] with an explicit home folder (tests; `None` = generic patterns only).
pub fn redact_with_home(text: &str, home: Option<&str>) -> String {
    let mut s = text.to_string();
    // Flags first: their values may be paths or URLs the later rules would only half-clean.
    s = FLAG_DQUOTED
        .replace_all(&s, |c: &Captures| {
            format!(
                "{}{}{}{}{REDACTED}{}",
                &c["pre"], &c["flag"], &c["sep"], &c["q"], &c["q2"]
            )
        })
        .into_owned();
    s = FLAG_SQUOTED
        .replace_all(&s, |c: &Captures| {
            format!("{}{}{}'{REDACTED}'", &c["pre"], &c["flag"], &c["sep"])
        })
        .into_owned();
    s = FLAG_BARE
        .replace_all(&s, |c: &Captures| {
            if c["val"].starts_with("[redacted") {
                return c[0].to_string();
            }
            format!("{}{}{}{REDACTED}", &c["pre"], &c["flag"], &c["sep"])
        })
        .into_owned();
    s = URL_USERINFO
        .replace_all(&s, |c: &Captures| format!("{}{REDACTED}@", &c["scheme"]))
        .into_owned();
    s = URL_QUERY
        .replace_all(&s, |c: &Captures| format!("{}?{REDACTED}", &c["base"]))
        .into_owned();
    if let Some(home) = home.filter(|h| !h.is_empty()) {
        s = s.replace(home, "~");
        let escaped = home.replace('\\', "\\\\");
        if escaped != home {
            s = s.replace(&escaped, "~");
        }
    }
    s = WIN_HOME.replace_all(&s, "~").into_owned();
    s = UNIX_HOME
        .replace_all(&s, |c: &Captures| format!("{}~", &c["pre"]))
        .into_owned();
    s = AUTH_SCHEME
        .replace_all(&s, |c: &Captures| format!("{} {REDACTED}", &c["k"]))
        .into_owned();
    s = HEADERS
        .replace_all(&s, |c: &Captures| {
            format!("{}{}{REDACTED}", &c["k"], &c["sep"])
        })
        .into_owned();
    s = NAMED
        .replace_all(&s, |c: &Captures| {
            format!("{}{}{REDACTED}", &c["k"], &c["sep"])
        })
        .into_owned();
    s = JAR_LINE_RAW
        .replace_all(&s, |c: &Captures| format!("{}{REDACTED}", &c["head"]))
        .into_owned();
    s = JAR_LINE_ESCAPED
        .replace_all(&s, |c: &Captures| format!("{}{REDACTED}", &c["head"]))
        .into_owned();
    s = LONG_RUN
        .replace_all(&s, |c: &Captures| {
            let run = &c[0];
            if UUID.is_match(run) || !run.bytes().any(|b| b.is_ascii_digit()) {
                run.to_string()
            } else {
                REDACTED.to_string()
            }
        })
        .into_owned();
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    fn r(s: &str) -> String {
        redact_with_home(s, None)
    }

    #[test]
    fn secret_flag_values_go() {
        assert_eq!(
            r("yt-dlp --video-password hunter2 https://x.com/v"),
            "yt-dlp --video-password [redacted] https://x.com/v"
        );
        assert_eq!(r("--twofactor=123456"), "--twofactor=[redacted]");
        assert_eq!(
            r(r#"--netrc-cmd "C:\Program Files\ymd\ymd.exe" --netrc-helper {}"#),
            r#"--netrc-cmd "[redacted]" --netrc-helper {}"#
        );
        assert_eq!(r("--cookies '/tmp/jar.txt'"), "--cookies '[redacted]'");
        assert_eq!(
            r("--cookies-from-browser firefox:default"),
            "--cookies-from-browser [redacted]"
        );
        assert_eq!(r("-u ana -p s3cret"), "-u [redacted] -p [redacted]");
        assert_eq!(r(r#"--password "two words""#), r#"--password "[redacted]""#);
    }

    #[test]
    fn secret_flags_in_argv_lists_and_json() {
        // Rust Debug of a Vec<String>
        assert_eq!(
            r(r#"["--video-password", "hunter2", "--twofactor", "999"]"#),
            r#"["--video-password", "[redacted]", "--twofactor", "[redacted]"]"#
        );
        // the same inside a JSON log line (escaped quotes)
        assert_eq!(
            r(r#"{"msg":"[\"--video-password\", \"hunter2\"]"}"#),
            r#"{"msg":"[\"--video-password\", \"[redacted]\"]"}"#
        );
        // escaped backslashes inside the quoted value
        assert_eq!(
            r(r#"\"--cookies\", \"C:\\\\tmp\\\\jar.txt\""#),
            r#"\"--cookies\", \"[redacted]\""#
        );
    }

    /// The proxy reveals the user's network setup: its value never reaches a log.
    #[test]
    fn proxy_value_goes() {
        assert_eq!(r("--proxy socks5h://127.0.0.1:1080"), "--proxy [redacted]");
        assert_eq!(r("--proxy=http://gw:8080"), "--proxy=[redacted]");
        assert_eq!(
            r(r#"["-4", "--proxy", "socks5://[::1]:1080", "--socket-timeout", "5"]"#),
            r#"["-4", "--proxy", "[redacted]", "--socket-timeout", "5"]"#
        );
        assert_eq!(
            r(r#"{"argv":"[\"--proxy\", \"http://proxy.example.com:3128\"]"}"#),
            r#"{"argv":"[\"--proxy\", \"[redacted]\"]"}"#
        );
        // Other flags that merely start with the word stay.
        assert_eq!(r("--proxy-headers ok"), "--proxy-headers ok");
    }

    #[test]
    fn flags_inside_words_are_not_touched() {
        assert_eq!(r("yt-dlp-p ok"), "yt-dlp-p ok");
        assert_eq!(r("--no-password-check x"), "--no-password-check x");
        assert_eq!(r("set-up value"), "set-up value");
    }

    #[test]
    fn url_queries_fragments_and_credentials_go() {
        assert_eq!(
            r("https://www.youtube.com/watch?v=abc&token=zzz done"),
            "https://www.youtube.com/watch?[redacted] done"
        );
        assert_eq!(
            r("http://example.com/a#access_token=xyz"),
            "http://example.com/a?[redacted]"
        );
        assert_eq!(
            r("https://ana:pw@example.com/x"),
            "https://[redacted]@example.com/x"
        );
        assert_eq!(
            r(r#"{"detail":"ERROR: https://x.com/v?sig=1\" end"}"#),
            r#"{"detail":"ERROR: https://x.com/v?[redacted]\" end"}"#
        );
        assert_eq!(r("https://youtu.be/abc"), "https://youtu.be/abc");
    }

    #[test]
    fn home_folders_become_tilde() {
        assert_eq!(
            r(r"C:\Users\Ana María\Videos\clip.mp4"),
            r"~\Videos\clip.mp4"
        );
        assert_eq!(
            r(r#"{"path":"C:\\Users\\ana\\AppData\\Roaming\\com.ymd.app"}"#),
            r#"{"path":"~\\AppData\\Roaming\\com.ymd.app"}"#
        );
        assert_eq!(r("d:/users/ana/x"), "~/x");
        assert_eq!(r("open /home/ana/Videos/a.mp4"), "open ~/Videos/a.mp4");
        assert_eq!(r(r#"path="/Users/ana/Library/x""#), r#"path="~/Library/x""#);
        assert_eq!(r("/var/home/ana/x"), "~/x");
        // not a home: left alone
        assert_eq!(r("/usr/home-made/x"), "/usr/home-made/x");
    }

    #[test]
    fn explicit_home_is_replaced_too() {
        assert_eq!(
            redact_with_home("/data/ana/Videos/a.mp4", Some("/data/ana")),
            "~/Videos/a.mp4"
        );
        assert_eq!(
            redact_with_home(r#"{"p":"E:\\me\\x"}"#, Some(r"E:\me")),
            r#"{"p":"~\\x"}"#
        );
    }

    #[test]
    fn tokens_and_cookies_go() {
        assert_eq!(
            r("Authorization: Bearer abc.def-ghi"),
            "Authorization: [redacted]"
        );
        assert_eq!(r("using bearer abc.def"), "using bearer [redacted]");
        assert_eq!(r("Cookie: SID=1; HSID=2"), "Cookie: [redacted]");
        assert_eq!(
            r("SID=abcdef; __Secure-3PSID=xyz"),
            "SID=[redacted]; __Secure-3PSID=[redacted]"
        );
        assert_eq!(
            r(r#"{"access_token":"t0k"}"#),
            r#"{"access_token":"[redacted]"}"#
        );
        assert_eq!(
            r(r#"{\"password\": \"pw\"}"#),
            r#"{\"password\": \"[redacted]\"}"#
        );
        assert_eq!(r("api_key=XYZ&a=1"), "api_key=[redacted]&a=1");
    }

    #[test]
    fn netscape_jar_values_go() {
        assert_eq!(
            r(".youtube.com\tTRUE\t/\tTRUE\t1999999999\tSID\tsecretvalue"),
            ".youtube.com\tTRUE\t/\tTRUE\t1999999999\tSID\t[redacted]"
        );
        assert_eq!(
            r(r#""line":".youtube.com\tTRUE\t/\tTRUE\t1999999999\tPREF\tf6=8""#),
            r#""line":".youtube.com\tTRUE\t/\tTRUE\t1999999999\tPREF\t[redacted]""#
        );
    }

    #[test]
    fn long_runs_go_but_uuids_and_words_stay() {
        let hex = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
        assert_eq!(r(&format!("sha256 {hex}")), "sha256 [redacted]");
        let b64 = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo0MjQyNDI0Mg==";
        assert_eq!(r(&format!("key {b64} end")), "key [redacted] end");
        let uuid = "3f2a8d5e-1b2c-4d3e-8f9a-0b1c2d3e4f5a";
        assert_eq!(r(&format!("job {uuid}")), format!("job {uuid}"));
        let word = "Supercalifragilisticexpialidocious_and_more";
        assert_eq!(r(word), word);
        assert_eq!(r("short1234"), "short1234");
    }

    #[test]
    fn idempotent_and_json_safe() {
        let line = r#"{"fields":{"message":"spawn","argv":"[\"--video-password\", \"pw\", \"--cookies\", \"C:\\\\Users\\\\ana\\\\jar.txt\", \"https://x.com/v?t=1\"]","detail":"Cookie: SID=1"},"span":{"id":"3f2a8d5e-1b2c-4d3e-8f9a-0b1c2d3e4f5a"}}"#;
        let once = r(line);
        assert_eq!(r(&once), once, "idempotent");
        let v: serde_json::Value = serde_json::from_str(&once).expect("still valid JSON");
        let argv = v["fields"]["argv"].as_str().unwrap();
        assert!(!argv.contains("pw\""), "{argv}");
        assert!(!argv.contains("ana"), "{argv}");
        assert!(!argv.contains("t=1"), "{argv}");
        assert_eq!(v["fields"]["detail"], "Cookie: [redacted]");
        assert_eq!(v["span"]["id"], "3f2a8d5e-1b2c-4d3e-8f9a-0b1c2d3e4f5a");
    }

    #[test]
    fn plain_text_is_unchanged() {
        let s = "stage finished: downloading took 1234 ms (outcome ok)";
        assert_eq!(r(s), s);
        assert_eq!(r(""), "");
    }
}
