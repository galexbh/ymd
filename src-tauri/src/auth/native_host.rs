//! Native-messaging host for the ymd Cookies extension. Contract:
//! `website/src/content/docs/desarrollo/puente-de-cookies.md`
//! (<https://galexbh.github.io/ymd/desarrollo/puente-de-cookies/>).
//!
//! The browser launches `ymd chrome-extension://<id>/ [--parent-window=N]` once per
//! `chrome.runtime.sendNativeMessage` call. [`host_main`] checks the origin, reads exactly one
//! length-prefixed JSON message from stdin, writes exactly one reply to stdout and returns the
//! exit code. It runs before Tauri starts (see `ymd_lib::maybe_run_native_host`).
//!
//! Cookie values never reach a log line or an error detail.

use crate::model::{CommandError, ErrorCode};
use crate::paths::AppPaths;
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{self, Read, Write};
use std::path::Path;

/// Native host name registered with the browsers.
pub const HOST_NAME: &str = "com.ymd.cookies";
/// Extension ID, fixed by the manifest `key` ([`EXTENSION_KEY_B64`]).
pub const EXTENSION_ID: &str = "gicaphbpepkphmeciigjhdpnbcaflfgd";
/// Public key (SPKI DER, base64) from the extension manifest. The ID is derived from it.
pub const EXTENSION_KEY_B64: &str = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAleZOXLWNeehtpLVMJ3N2+P25O02a6I+9f2iACBHuQDaqRH6x2PFX8QIRBjGk5Ab8y4kTlJq72+2/NmQ+AUJ93dRt4HZNxBIKlxz2J/pd2o+krs3Xjx8qNX318pb40jmn5Y8gb4IKrKITa26Qm3fuT0cIY0WvoK0qSLynK/wI1FznJ0nELbiDwrnvYHeuEjzUouDF/H1QzzsbtfNp22X0UdiXFTQQjb1k0LgF9rlQCS2OPAgj3JCxxEPYOp7UW+6Cn3/BsHcRPgHEZ/HIYSlJTtNUdSB7cOwzRhvTcRRMQdjEUvTx/T+0dA4n8/0CgShKSk5mPBAauwQfh+OByGarPwIDAQAB";
/// Protocol version spoken by this host.
pub const PROTOCOL: u32 = 1;
/// Largest inbound message accepted (the browser caps host → extension at 1 MiB, and
/// extension → host at 64 MiB; a cookie jar is far below this).
pub const MAX_MESSAGE: u32 = 16 * 1024 * 1024;

const NETSCAPE_HEADER: &str = "# Netscape HTTP Cookie File";
const BROWSERS: [&str; 7] = [
    "brave", "chrome", "edge", "chromium", "vivaldi", "opera", "other",
];

/// `chrome-extension://<EXTENSION_ID>/`, the only origin allowed to talk to the host.
pub fn allowed_origin() -> String {
    format!("chrome-extension://{EXTENSION_ID}/")
}

/// True when `arg` is the extension's origin (with or without the trailing slash).
pub fn is_allowed_origin(arg: &str) -> bool {
    arg.strip_prefix("chrome-extension://")
        .map(|rest| rest.strip_suffix('/').unwrap_or(rest))
        == Some(EXTENSION_ID)
}

// ───────────────────────────── framing ─────────────────────────────

/// Read one message: little-endian u32 length, then that many bytes.
///
/// Errors: `UnexpectedEof` when the stream ends early, `InvalidData` when the length exceeds
/// [`MAX_MESSAGE`] (nothing past the length prefix is read in that case).
pub fn read_message<R: Read>(r: &mut R) -> io::Result<Vec<u8>> {
    let mut len = [0u8; 4];
    r.read_exact(&mut len)?;
    let len = u32::from_le_bytes(len);
    if len > MAX_MESSAGE {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("message of {len} bytes exceeds the {MAX_MESSAGE}-byte limit"),
        ));
    }
    let mut buf = vec![0u8; len as usize];
    r.read_exact(&mut buf)?;
    Ok(buf)
}

/// Write one message (length prefix + JSON) and flush.
pub fn write_message<W: Write>(w: &mut W, msg: &Value) -> io::Result<()> {
    let body = serde_json::to_vec(msg).map_err(io::Error::other)?;
    let len = u32::try_from(body.len())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "message too large"))?;
    w.write_all(&len.to_le_bytes())?;
    w.write_all(&body)?;
    w.flush()
}

// ───────────────────────────── messages ─────────────────────────────

/// Mirrors `chrome.cookies.Cookie` (only the fields ymd needs).
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChromeCookie {
    pub domain: String,
    #[serde(default)]
    pub host_only: bool,
    #[serde(default = "root_path")]
    pub path: String,
    #[serde(default)]
    pub secure: bool,
    #[serde(default)]
    pub http_only: bool,
    #[serde(default)]
    pub session: bool,
    #[serde(default)]
    pub expiration_date: Option<f64>,
    pub name: String,
    pub value: String,
}

fn root_path() -> String {
    "/".into()
}

/// Extension → host messages.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Request {
    Hello {
        #[serde(default)]
        version: Option<u32>,
    },
    Cookies {
        #[serde(default)]
        version: Option<u32>,
        browser: String,
        cookies: Vec<ChromeCookie>,
    },
}

impl Request {
    fn version(&self) -> Option<u32> {
        match self {
            Request::Hello { version } | Request::Cookies { version, .. } => *version,
        }
    }
}

/// Parse a message body. The error detail never quotes the input (it may hold cookie values).
pub fn parse_request(body: &[u8]) -> Result<Request, CommandError> {
    let req: Request = serde_json::from_slice(body).map_err(|e| {
        let kind = match e.classify() {
            serde_json::error::Category::Io => "io",
            serde_json::error::Category::Syntax => "syntax",
            serde_json::error::Category::Data => "unexpected shape",
            serde_json::error::Category::Eof => "truncated",
        };
        CommandError::unknown(format!(
            "invalid message ({kind} at line {} column {})",
            e.line(),
            e.column()
        ))
    })?;
    if let Some(v) = req.version() {
        if v > PROTOCOL {
            return Err(CommandError::unknown(format!(
                "protocol version {v} is newer than {PROTOCOL}; update ymd"
            )));
        }
    }
    Ok(req)
}

fn error_reply(e: &CommandError) -> Value {
    json!({"ok": false, "code": e.code, "detail": e.detail})
}

fn hello_reply() -> Value {
    json!({
        "ok": true,
        "app": "ymd",
        "appVersion": env!("CARGO_PKG_VERSION"),
        "protocol": PROTOCOL,
    })
}

/// Map the extension's browser name to the closed set of the contract.
fn browser_name(raw: &str) -> &'static str {
    let lower = raw.trim().to_ascii_lowercase();
    BROWSERS
        .iter()
        .copied()
        .find(|b| *b == lower)
        .unwrap_or("other")
}

// ───────────────────────────── Netscape conversion ─────────────────────────────

fn has_control(s: &str) -> bool {
    s.contains(['\t', '\r', '\n'])
}

/// Pure: `chrome.cookies` records → Netscape cookies.txt (header first, one line per cookie).
///
/// Cookies whose domain, path, name or value contain a tab or line break, or that have an
/// empty name or domain, are skipped: they cannot be represented in the format.
pub fn cookies_to_netscape(cookies: &[ChromeCookie]) -> String {
    let mut out = String::with_capacity(64 + cookies.len() * 96);
    out.push_str(NETSCAPE_HEADER);
    out.push('\n');
    for c in cookies {
        let bare = c.domain.trim().trim_start_matches('.');
        if bare.is_empty()
            || c.name.is_empty()
            || [bare, c.path.as_str(), c.name.as_str(), c.value.as_str()]
                .iter()
                .any(|s| has_control(s))
        {
            continue;
        }
        let (domain, subdomains) = if c.host_only {
            (bare.to_string(), "FALSE")
        } else {
            (format!(".{bare}"), "TRUE")
        };
        let expiry = match (c.session, c.expiration_date) {
            (false, Some(t)) if t.is_finite() && t > 0.0 => t.floor() as u64,
            _ => 0,
        };
        let path = if c.path.is_empty() { "/" } else { &c.path };
        let flag = |b: bool| if b { "TRUE" } else { "FALSE" };
        if c.http_only {
            out.push_str("#HttpOnly_");
        }
        out.push_str(&format!(
            "{domain}\t{subdomains}\t{path}\t{}\t{expiry}\t{}\t{}\n",
            flag(c.secure),
            c.name,
            c.value
        ));
    }
    out
}

// ───────────────────────────── host ─────────────────────────────

fn handle(req: Request, data_dir: &Path) -> Result<Value, CommandError> {
    match req {
        Request::Hello { .. } => Ok(hello_reply()),
        Request::Cookies {
            browser, cookies, ..
        } => {
            let browser = browser_name(&browser);
            let text = cookies_to_netscape(&cookies);
            let paths = AppPaths {
                bin_dir: data_dir.join("bin"),
                data_dir: data_dir.to_path_buf(),
                config_dir: data_dir.to_path_buf(),
            };
            let info = crate::auth::cookies::store(&paths, &text, &format!("extension:{browser}"))?;
            log::info!(
                "cookie bridge: stored {} cookies from {browser}",
                info.cookie_count
            );
            Ok(json!({"ok": true, "count": info.cookie_count, "domains": info.domains}))
        }
    }
}

/// Run the host. `args[0]` is the caller origin; the rest (`--parent-window=N`) is ignored.
/// Returns the process exit code: 0 after a reply (even an error reply), 1 when the origin is
/// not allowed (nothing is read or written) or the reply cannot be written.
pub fn host_main<R: Read, W: Write>(
    args: &[String],
    data_dir: &Path,
    mut stdin: R,
    mut stdout: W,
) -> i32 {
    if !args.first().is_some_and(|o| is_allowed_origin(o)) {
        log::warn!("cookie bridge: rejected origin {:?}", args.first());
        return 1;
    }
    let (reply, code) = match read_message(&mut stdin) {
        Ok(body) => match parse_request(&body).and_then(|r| handle(r, data_dir)) {
            Ok(v) => (v, 0),
            Err(e) => (error_reply(&e), 0),
        },
        Err(e) => (
            error_reply(&CommandError::new(ErrorCode::Unknown, e.to_string())),
            1,
        ),
    };
    match write_message(&mut stdout, &reply) {
        Ok(()) => code,
        Err(_) => 1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(body: &[u8]) -> Vec<u8> {
        let mut v = (body.len() as u32).to_le_bytes().to_vec();
        v.extend_from_slice(body);
        v
    }

    fn cookie(domain: &str, host_only: bool, name: &str, value: &str) -> ChromeCookie {
        ChromeCookie {
            domain: domain.into(),
            host_only,
            path: "/".into(),
            secure: true,
            http_only: false,
            session: false,
            expiration_date: Some(1_999_999_999.75),
            name: name.into(),
            value: value.into(),
        }
    }

    #[test]
    fn framing_round_trip() {
        let msg = json!({"type": "hello", "version": 1, "ñ": "ü"});
        let mut buf = Vec::new();
        write_message(&mut buf, &msg).unwrap();
        let body = serde_json::to_vec(&msg).unwrap();
        assert_eq!(&buf[..4], &(body.len() as u32).to_le_bytes());
        let got = read_message(&mut buf.as_slice()).unwrap();
        assert_eq!(serde_json::from_slice::<Value>(&got).unwrap(), msg);
        // Empty body is a valid frame.
        assert!(read_message(&mut frame(b"").as_slice()).unwrap().is_empty());
    }

    #[test]
    fn framing_truncated() {
        for input in [&[][..], &[5, 0][..], &frame(b"hello")[..7]] {
            let e = read_message(&mut &input[..]).unwrap_err();
            assert_eq!(e.kind(), io::ErrorKind::UnexpectedEof, "{input:?}");
        }
    }

    #[test]
    fn framing_oversize() {
        let mut input = (MAX_MESSAGE + 1).to_le_bytes().to_vec();
        input.extend_from_slice(b"{}");
        let e = read_message(&mut input.as_slice()).unwrap_err();
        assert_eq!(e.kind(), io::ErrorKind::InvalidData);
        // Exactly the limit is accepted by the length check (then needs the bytes).
        let at_limit = MAX_MESSAGE.to_le_bytes();
        let e = read_message(&mut at_limit.as_slice()).unwrap_err();
        assert_eq!(e.kind(), io::ErrorKind::UnexpectedEof);
    }

    #[test]
    fn message_parsing() {
        assert_eq!(
            parse_request(br#"{"type":"hello","version":1}"#).unwrap(),
            Request::Hello { version: Some(1) }
        );
        assert_eq!(
            parse_request(br#"{"type":"hello"}"#).unwrap(),
            Request::Hello { version: None }
        );
        let r = parse_request(
            br#"{"type":"cookies","version":1,"browser":"brave","cookies":[
                {"domain":".youtube.com","hostOnly":false,"path":"/","secure":true,
                 "httpOnly":true,"session":false,"expirationDate":1999999999.5,
                 "name":"SID","value":"v","sameSite":"lax","storeId":"0"}]}"#,
        )
        .unwrap();
        let Request::Cookies {
            browser, cookies, ..
        } = r
        else {
            panic!("not cookies")
        };
        assert_eq!(browser, "brave");
        assert_eq!(cookies.len(), 1);
        assert!(cookies[0].http_only && !cookies[0].host_only);
        assert_eq!(cookies[0].expiration_date, Some(1_999_999_999.5));

        // Errors never echo the input.
        for bad in [
            &br#"{"type":"cookies","browser":"brave","cookies":[{"domain":"a","name":"n","value":42}]}"#[..],
            br#"{"type":"bogus","value":"SECRETVALUE"}"#,
            br#"not json SECRETVALUE"#,
            br#"{"type":"hello","version":2}"#,
        ] {
            let e = parse_request(bad).unwrap_err();
            assert_eq!(e.code, ErrorCode::Unknown);
            assert!(!e.detail.contains("SECRETVALUE"), "{}", e.detail);
            assert!(!e.detail.contains("42"), "{}", e.detail);
        }
    }

    #[test]
    fn browser_names_are_closed() {
        assert_eq!(browser_name("Brave"), "brave");
        assert_eq!(browser_name("edge"), "edge");
        assert_eq!(browser_name("../../etc"), "other");
        assert_eq!(browser_name(""), "other");
    }

    #[test]
    fn netscape_conversion() {
        let mut http_only = cookie(".youtube.com", false, "HSID", "h1");
        http_only.http_only = true;
        let mut session = cookie("accounts.google.com", true, "SESS", "s1");
        session.session = true;
        session.secure = false;
        session.path = "/signin".into();
        let mut no_expiry = cookie("example.org", false, "NOEXP", "e1");
        no_expiry.expiration_date = None;
        let mut bad_tab = cookie(".youtube.com", false, "TAB", "a\tb");
        bad_tab.http_only = true;
        let bad_nl = cookie(".youtube.com", false, "NL\n", "x");
        let bad_cr = cookie(".youtube.com", false, "CR", "x\r");
        let empty_name = cookie(".youtube.com", false, "", "x");
        let text = cookies_to_netscape(&[
            cookie(".youtube.com", false, "SID", "v1"),
            cookie("www.youtube.com", true, "HOSTONLY", "v2"),
            cookie(".music.youtube.com", true, "DOTTED_HOSTONLY", "v3"),
            http_only,
            session,
            no_expiry,
            bad_tab,
            bad_nl,
            bad_cr,
            empty_name,
        ]);
        insta::assert_snapshot!(text);
        let (n, domains) = crate::auth::cookies::parse_netscape(&text).unwrap();
        assert_eq!(n, 6);
        assert_eq!(
            domains,
            [
                "accounts.google.com",
                "example.org",
                "music.youtube.com",
                "www.youtube.com",
                "youtube.com"
            ]
        );
    }

    #[test]
    fn netscape_empty_is_header_only() {
        assert_eq!(cookies_to_netscape(&[]), format!("{NETSCAPE_HEADER}\n"));
    }

    #[test]
    fn origin_validation() {
        let id = EXTENSION_ID;
        assert!(is_allowed_origin(&format!("chrome-extension://{id}/")));
        assert!(is_allowed_origin(&format!("chrome-extension://{id}")));
        assert_eq!(allowed_origin(), format!("chrome-extension://{id}/"));
        for bad in [
            "",
            id,
            "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/",
            &format!("chrome-extension://{id}//"),
            &format!("chrome-extension://{id}/x"),
            &format!("moz-extension://{id}/"),
            &format!("CHROME-EXTENSION://{id}/"),
            "--netrc-helper",
        ] {
            assert!(!is_allowed_origin(bad), "{bad}");
        }
    }

    #[test]
    fn extension_id_matches_key() {
        use base64::Engine;
        use sha2::{Digest, Sha256};
        let der = base64::engine::general_purpose::STANDARD
            .decode(EXTENSION_KEY_B64)
            .unwrap();
        let hash = Sha256::digest(&der);
        let id: String = hash[..16]
            .iter()
            .flat_map(|b| [b >> 4, b & 0x0f])
            .map(|n| (b'a' + n) as char)
            .collect();
        assert_eq!(id, EXTENSION_ID);
    }

    #[test]
    fn host_main_rejects_origin_without_reading() {
        let dir = tempfile::tempdir().unwrap();
        let input = frame(br#"{"type":"hello"}"#);
        let mut out = Vec::new();
        let mut reader = input.as_slice();
        let code = host_main(
            &["chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/".into()],
            dir.path(),
            &mut reader,
            &mut out,
        );
        assert_eq!(code, 1);
        assert!(out.is_empty());
        assert_eq!(reader.len(), input.len(), "stdin must not be read");
        assert_eq!(host_main(&[], dir.path(), &input[..], &mut out), 1);
    }

    fn run(body: &[u8], data_dir: &Path) -> (i32, Value) {
        let mut out = Vec::new();
        let code = host_main(
            &[allowed_origin(), "--parent-window=0".into()],
            data_dir,
            &frame(body)[..],
            &mut out,
        );
        let reply = read_message(&mut out.as_slice()).unwrap();
        (code, serde_json::from_slice(&reply).unwrap())
    }

    #[test]
    fn host_main_replies() {
        let dir = tempfile::tempdir().unwrap();
        let (code, v) = run(br#"{"type":"hello","version":1}"#, dir.path());
        assert_eq!(code, 0);
        assert_eq!(v["ok"], true);
        assert_eq!(v["app"], "ymd");
        assert_eq!(v["appVersion"], env!("CARGO_PKG_VERSION"));
        assert_eq!(v["protocol"], 1);

        let (code, v) = run(
            br#"{"type":"cookies","version":1,"browser":"edge","cookies":[
                {"domain":"a.com","hostOnly":true,"path":"/","secure":false,"httpOnly":false,
                 "session":true,"name":"n","value":"SECRETVALUE"}]}"#,
            dir.path(),
        );
        assert_eq!(code, 0);
        assert_eq!(v, json!({"ok": true, "count": 1, "domains": ["a.com"]}));

        // Nothing representable → error reply, and the previous jar stays.
        let (code, v) = run(
            br#"{"type":"cookies","browser":"edge","cookies":[
                {"domain":"a.com","name":"n","value":"SECRET\tVALUE"}]}"#,
            dir.path(),
        );
        assert_eq!(code, 0);
        assert_eq!(v["ok"], false);
        assert_eq!(v["code"], "unknown");
        assert!(!v["detail"].as_str().unwrap().contains("SECRET"));
        let jar = std::fs::read_to_string(dir.path().join("auth/cookies.txt")).unwrap();
        assert!(jar.contains("SECRETVALUE"));

        // Truncated frame → error reply, exit 1.
        let mut out = Vec::new();
        let code = host_main(
            &[allowed_origin()],
            dir.path(),
            &[9u8, 0, 0, 0, b'{'][..],
            &mut out,
        );
        assert_eq!(code, 1);
        let v: Value = serde_json::from_slice(&read_message(&mut out.as_slice()).unwrap()).unwrap();
        assert_eq!(v["ok"], false);
    }
}
