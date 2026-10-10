//! `--netrc-cmd` helper: yt-dlp runs `"<ymd exe>" --netrc-helper <extractor>` and reads one
//! netrc line from stdout. Owner: C.
//!
//! How yt-dlp runs it (`InfoExtractor._get_netrc_login_info`): `{}` is replaced by the
//! extractor's netrc machine (restricted to `[A-Za-z0-9._-]`, so it is shell-safe), then the
//! string goes through the shell: `/bin/sh -c` on Unix, and on Windows
//! `cmd.exe /Q /S /D /V:OFF /E:ON /C "<cmd>"` — `/S` strips exactly the outer pair of quotes, so a
//! quoted exe path survives. A non-zero exit is reported by yt-dlp as the warning
//! "Failed to parse .netrc: Command returned error code N"; empty output is reported as the
//! quiet info line "No authenticators for <machine>".
//!
//! Output is parsed by the stdlib `netrc` module of the Python that runs yt-dlp. Python ≥ 3.11
//! accepts `"…"` tokens with backslash escapes and treats `\` in bare tokens as an escape;
//! Python 3.10 (still used by the official Windows `yt-dlp.exe` as of 2026.08) only accepts bare
//! printable-ASCII tokens and keeps quotes and backslashes literally. `format_line` therefore
//! emits bare tokens whenever both parsers read them identically and falls back to the ≥ 3.11
//! quoted form otherwise (see [`portable`]).

use super::keychain::SecretStore;
use std::io::Write;

pub const HELPER_FLAG: &str = "--netrc-helper";

/// Value for yt-dlp's `--netrc-cmd` (quoted for the shell yt-dlp uses; `{}` = extractor).
pub fn netrc_cmd(helper_exe: &std::path::Path) -> String {
    let exe = helper_exe.to_string_lossy();
    if cfg!(windows) {
        // Windows paths cannot contain `"`, so plain double quotes are always enough.
        // (A `%NAME%` sequence in the path would still be expanded by cmd; install paths
        // don't contain one.)
        format!("\"{exe}\" {HELPER_FLAG} {{}}")
    } else {
        format!("{} {HELPER_FLAG} {{}}", sh_quote(&exe))
    }
}

/// POSIX sh single-quote escaping: `it's` → `'it'\''s'`.
fn sh_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

/// Pure: one netrc line. Quotes/escapes values containing whitespace.
pub fn format_line(machine: &str, login: &str, password: &str) -> String {
    format!(
        "machine {} login {} password {}",
        token(machine),
        token(login),
        token(password)
    )
}

/// True when every Python `netrc` parser yt-dlp may run on (3.10 and ≥ 3.11) reads the
/// bare value back unchanged: non-empty printable ASCII, no `\`, not starting with `"`.
pub fn portable(value: &str) -> bool {
    !value.is_empty()
        && value.bytes().all(|b| b.is_ascii_graphic() && b != b'\\')
        && !value.starts_with('"')
}

fn token(value: &str) -> String {
    let needs_quotes = value.is_empty()
        || value.starts_with('"')
        || value.chars().any(|c| c.is_whitespace() || c == '\\');
    if !needs_quotes {
        return value.to_string();
    }
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for c in value.chars() {
        if c == '"' || c == '\\' {
            out.push('\\');
        }
        out.push(c);
    }
    out.push('"');
    out
}

/// Entry point used by `main.rs` before Tauri starts. Returns the process exit code.
///
/// A missing credential prints nothing and exits 0: yt-dlp then logs "No authenticators for
/// <machine>" and continues without login. (Exiting non-zero would make yt-dlp print a
/// "Failed to parse .netrc" warning on every download from a login-capable site — e.g. every
/// YouTube download — whenever any account is stored.)
pub fn helper_main(args: &[String], store: &dyn SecretStore) -> i32 {
    let stdout = std::io::stdout();
    let mut lock = stdout.lock();
    helper_main_to(args, store, &mut lock, &mut std::io::stderr())
}

/// [`helper_main`] with injectable output streams (for tests). Never writes the password
/// anywhere but `out`.
pub fn helper_main_to(
    args: &[String],
    store: &dyn SecretStore,
    out: &mut dyn Write,
    err: &mut dyn Write,
) -> i32 {
    let machine = match args {
        [flag, machine] if flag == HELPER_FLAG && !machine.trim().is_empty() => machine.trim(),
        _ => {
            let _ = writeln!(err, "usage: ymd {HELPER_FLAG} <netrc-machine>");
            return 2;
        }
    };
    match store.get(machine) {
        Ok(Some((login, password))) => {
            if !(portable(machine) && portable(&login) && portable(&password)) {
                let _ = writeln!(
                    err,
                    "ymd: the saved account for {machine} contains spaces, quotes, backslashes or \
                     non-ASCII characters; yt-dlp builds running on Python < 3.11 cannot read it"
                );
            }
            let line = format_line(machine, &login, &password);
            if writeln!(out, "{line}").and_then(|_| out.flush()).is_err() {
                return 1;
            }
            0
        }
        Ok(None) => 0,
        Err(e) => {
            let _ = writeln!(err, "ymd: keychain error for {machine}: {e:#}");
            1
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::keychain::MemoryStore;

    fn run(args: &[&str], store: &MemoryStore) -> (i32, String, String) {
        let args: Vec<String> = args.iter().map(|s| s.to_string()).collect();
        let (mut out, mut err) = (Vec::new(), Vec::new());
        let code = helper_main_to(&args, store, &mut out, &mut err);
        (
            code,
            String::from_utf8(out).unwrap(),
            String::from_utf8(err).unwrap(),
        )
    }

    #[test]
    fn format_line_bare() {
        assert_eq!(
            format_line("vimeo", "me@example.com", "p4ss!#$%'\"x"),
            "machine vimeo login me@example.com password p4ss!#$%'\"x"
        );
        assert_eq!(
            format_line("vimeo", "u", "machine"),
            "machine vimeo login u password machine"
        );
    }

    #[test]
    fn format_line_quoted() {
        assert_eq!(
            format_line("vimeo", "John Doe", "pa ss"),
            r#"machine vimeo login "John Doe" password "pa ss""#
        );
        assert_eq!(
            format_line("m", "u", r"a\b"),
            r#"machine m login u password "a\\b""#
        );
        assert_eq!(
            format_line("m", "u", "\"lead"),
            r#"machine m login u password "\"lead""#
        );
        assert_eq!(
            format_line("m", "u", ""),
            r#"machine m login u password """#
        );
        assert_eq!(
            format_line("m", "u", "tab\there"),
            "machine m login u password \"tab\there\""
        );
        // Non-ASCII without whitespace stays bare (fine for Python >= 3.11).
        assert_eq!(
            format_line("m", "ñandú", "€uro"),
            "machine m login ñandú password €uro"
        );
    }

    #[test]
    fn portable_rules() {
        assert!(portable("p4ss!#$%'\"x"));
        assert!(!portable(""));
        assert!(!portable("a b"));
        assert!(!portable(r"a\b"));
        assert!(!portable("\"a"));
        assert!(!portable("ñ"));
    }

    #[test]
    fn netrc_cmd_quoting() {
        if cfg!(windows) {
            assert_eq!(
                netrc_cmd(std::path::Path::new(r"C:\Program Files\ymd\ymd.exe")),
                r#""C:\Program Files\ymd\ymd.exe" --netrc-helper {}"#
            );
        } else {
            assert_eq!(
                netrc_cmd(std::path::Path::new("/Applications/ymd app/ymd")),
                "'/Applications/ymd app/ymd' --netrc-helper {}"
            );
            assert_eq!(
                netrc_cmd(std::path::Path::new("/home/o'neil/ymd")),
                r"'/home/o'\''neil/ymd' --netrc-helper {}"
            );
        }
    }

    #[test]
    fn sh_quote_escapes() {
        assert_eq!(sh_quote("a b"), "'a b'");
        assert_eq!(sh_quote("it's"), r"'it'\''s'");
    }

    #[test]
    fn helper_hit() {
        let store = MemoryStore::default();
        store.set("vimeo", "me@example.com", "s3cret").unwrap();
        let (code, out, err) = run(&[HELPER_FLAG, "vimeo"], &store);
        assert_eq!(code, 0);
        assert_eq!(out, "machine vimeo login me@example.com password s3cret\n");
        assert!(err.is_empty());
    }

    #[test]
    fn helper_hit_needs_quotes_warns_without_password() {
        let store = MemoryStore::default();
        store.set("vimeo", "me", "with space").unwrap();
        let (code, out, err) = run(&[HELPER_FLAG, "vimeo"], &store);
        assert_eq!(code, 0);
        assert_eq!(out, "machine vimeo login me password \"with space\"\n");
        assert!(err.contains("Python < 3.11"));
        assert!(!err.contains("with space"));
    }

    #[test]
    fn helper_miss_prints_nothing() {
        let store = MemoryStore::default();
        store.set("vimeo", "me", "pw").unwrap();
        let (code, out, err) = run(&[HELPER_FLAG, "youtube"], &store);
        assert_eq!(code, 0);
        assert!(out.is_empty());
        assert!(err.is_empty());
    }

    #[test]
    fn helper_bad_args() {
        let store = MemoryStore::default();
        for args in [
            &[HELPER_FLAG][..],
            &[HELPER_FLAG, ""],
            &["--other", "vimeo"],
            &[],
        ] {
            let (code, out, _) = run(args, &store);
            assert_eq!(code, 2);
            assert!(out.is_empty());
        }
    }

    #[test]
    fn helper_store_error_exit_1() {
        struct Broken;
        impl SecretStore for Broken {
            fn get(&self, _: &str) -> anyhow::Result<Option<(String, String)>> {
                anyhow::bail!("locked")
            }
            fn set(&self, _: &str, _: &str, _: &str) -> anyhow::Result<()> {
                unreachable!()
            }
            fn delete(&self, _: &str) -> anyhow::Result<()> {
                unreachable!()
            }
            fn list(&self) -> anyhow::Result<Vec<crate::model::SiteCredential>> {
                unreachable!()
            }
        }
        let args = vec![HELPER_FLAG.to_string(), "vimeo".to_string()];
        let (mut out, mut err) = (Vec::new(), Vec::new());
        assert_eq!(helper_main_to(&args, &Broken, &mut out, &mut err), 1);
        assert!(out.is_empty());
        assert!(String::from_utf8(err).unwrap().contains("locked"));
    }

    /// Runs the generated command exactly the way yt-dlp does on Windows
    /// (`cmd.exe /Q /S /D /V:OFF /E:ON /C "<cmd>"`) with a helper whose path contains spaces.
    #[cfg(windows)]
    #[test]
    fn cmd_exe_round_trip_with_spaces() {
        use std::os::windows::process::CommandExt;
        let dir = tempfile::tempdir().unwrap();
        let sub = dir.path().join("Program Files (x86)").join("ymd & co");
        std::fs::create_dir_all(&sub).unwrap();
        let helper = sub.join("ymd helper.cmd");
        std::fs::write(&helper, "@echo off\r\necho ARGS=[%1] [%2]\r\n").unwrap();

        let cmd = netrc_cmd(&helper).replace("{}", "vimeo");
        let comspec = std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".into());
        let out = std::process::Command::new(comspec)
            .raw_arg(format!("/Q /S /D /V:OFF /E:ON /C \"{cmd}\""))
            .output()
            .unwrap();
        assert!(out.status.success(), "{out:?}");
        let stdout = String::from_utf8_lossy(&out.stdout);
        assert_eq!(stdout.trim(), "ARGS=[--netrc-helper] [vimeo]");
    }
}
