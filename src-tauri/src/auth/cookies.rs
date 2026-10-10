//! cookies.txt snapshot / import / test / clear. Owner: C.
//! The file lives at `AppPaths::cookies_file()` with owner-only permissions (0600 / user ACL).
//!
//! Permissions: on Unix every file is created 0600 (and the auth dir 0700) before any byte is
//! written. On Windows the file lives under `%APPDATA%\<id>\auth`, whose inherited ACL already
//! grants access only to the user, SYSTEM and Administrators, so no extra ACL work is done.
//!
//! Snapshot invocation (verified with yt-dlp 2026.08.19): yt-dlp loads the browser jar when
//! `--cookies-from-browser` is given and writes the merged jar to `--cookies FILE` on exit.
//! The cheapest run that exits 0 without touching the network is `--load-info-json` with a
//! tiny synthetic info dict plus `--simulate --skip-download`. (Running with no URL also writes
//! the jar, but always exits 2 with a usage error, which hides real failures.)

use crate::deps::Tools;
use crate::model::{
    Browser, CmdResult, CommandError, CookieFileInfo, CookieTestResult, ErrorCode, JobError,
};
use crate::paths::AppPaths;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::time::Duration;

const HEADER: &str = "# Netscape HTTP Cookie File";
const MAX_IMPORT_BYTES: u64 = 16 * 1024 * 1024;
const SNAPSHOT_TIMEOUT: Duration = Duration::from_secs(120);
const TEST_TIMEOUT: Duration = Duration::from_secs(90);
/// Public, long-lived video used by "Test cookies".
pub const TEST_URL: &str = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Meta {
    created_at: String,
    origin: String,
}

fn meta_file(paths: &AppPaths) -> PathBuf {
    paths.auth_dir().join("cookies.meta.json")
}

/// Dump the browser's cookies once into ymd's own cookies.txt via
/// `yt-dlp --cookies-from-browser B[:P] --cookies <file> --skip-download <probe-url>`.
pub async fn snapshot(
    tools: &Tools,
    paths: &AppPaths,
    browser: Browser,
    profile: Option<&str>,
) -> CmdResult<CookieFileInfo> {
    let ytdlp = tools
        .ytdlp
        .clone()
        .ok_or_else(|| CommandError::new(ErrorCode::BinaryMissing, "yt-dlp is not installed"))?;
    let dir = paths.auth_dir();
    ensure_private_dir(&dir)?;
    let id = uuid::Uuid::new_v4().simple().to_string();
    let jar = TempFile(dir.join(format!(".cookies-{id}.tmp")));
    let info_json = TempFile(dir.join(format!(".snapshot-{id}.info.json")));
    // yt-dlp refuses to load a jar without the magic header, so seed it.
    write_private_new(&jar.0, format!("{HEADER}\n").as_bytes())?;
    std::fs::write(
        &info_json.0,
        r#"{"id":"ymd-cookie-snapshot","title":"ymd","url":"http://127.0.0.1:9/","ext":"mp4","extractor":"generic","extractor_key":"Generic","webpage_url":"http://127.0.0.1:9/"}"#,
    )
    .map_err(|e| CommandError::new(ErrorCode::PermissionDenied, e.to_string()))?;

    let spec = super::browser_spec(browser, profile);
    let args: Vec<String> = vec![
        "--ignore-config".into(),
        "--quiet".into(),
        "--no-progress".into(),
        "--simulate".into(),
        "--skip-download".into(),
        "--load-info-json".into(),
        info_json.0.to_string_lossy().into_owned(),
        "--cookies-from-browser".into(),
        spec.clone(),
        "--cookies".into(),
        jar.0.to_string_lossy().into_owned(),
    ];
    let run = run_ytdlp(&ytdlp, &args, SNAPSHOT_TIMEOUT).await;
    drop(info_json);
    let stderr = match run {
        Ok(r) if r.success => r.stderr,
        Ok(r) => return Err(classify_failure(&r.stderr)),
        Err(e) => return Err(e),
    };
    let text = std::fs::read_to_string(&jar.0).map_err(CommandError::unknown)?;
    match parse_netscape(&text) {
        Ok((n, _)) if n > 0 => {}
        _ => {
            // yt-dlp may only warn (e.g. "cannot decrypt v10 cookies: no key found").
            let e = classify(&stderr);
            return Err(if e.code == ErrorCode::CookiesDecrypt {
                CommandError::new(e.code, e.detail)
            } else {
                CommandError::new(
                    ErrorCode::Unknown,
                    format!("no cookies found in {spec} (is this profile signed in?)"),
                )
            });
        }
    }
    let target = paths.cookies_file();
    std::fs::rename(&jar.0, &target).map_err(CommandError::unknown)?;
    let meta = Meta {
        created_at: chrono::Utc::now().to_rfc3339(),
        origin: spec,
    };
    write_private(
        &meta_file(paths),
        &serde_json::to_vec(&meta).unwrap_or_default(),
    )?;
    info(paths).ok_or_else(|| CommandError::unknown("snapshot written but unreadable"))
}

/// Copy a user-provided Netscape cookies.txt into place after validating its format.
pub fn import(paths: &AppPaths, source: &std::path::Path) -> CmdResult<CookieFileInfo> {
    let meta = std::fs::metadata(source).map_err(|e| {
        CommandError::new(
            ErrorCode::PermissionDenied,
            format!("{}: {e}", source.display()),
        )
    })?;
    if meta.len() > MAX_IMPORT_BYTES {
        return Err(CommandError::unknown(
            "file is too large to be a cookies.txt",
        ));
    }
    let bytes = std::fs::read(source).map_err(|e| {
        CommandError::new(
            ErrorCode::PermissionDenied,
            format!("{}: {e}", source.display()),
        )
    })?;
    let text = String::from_utf8_lossy(&bytes);
    let text = text.strip_prefix('\u{feff}').unwrap_or(&text);
    parse_netscape(text).map_err(|e| CommandError::unknown(format!("{e:#}")))?;
    let normalized = normalize_for_ytdlp(text);
    ensure_private_dir(&paths.auth_dir())?;
    // Content is copied; no reference to `source` is kept.
    write_private(&paths.cookies_file(), normalized.as_bytes())?;
    let meta = Meta {
        created_at: chrono::Utc::now().to_rfc3339(),
        origin: "import".into(),
    };
    write_private(
        &meta_file(paths),
        &serde_json::to_vec(&meta).unwrap_or_default(),
    )?;
    info(paths).ok_or_else(|| CommandError::unknown("import written but unreadable"))
}

/// Write `text` (a Netscape jar) as ymd's cookies.txt plus its meta, both owner-only and
/// atomic, after validating it. Used by the native-messaging host
/// (`origin = "extension:<browser>"`).
pub(crate) fn store(paths: &AppPaths, text: &str, origin: &str) -> CmdResult<CookieFileInfo> {
    parse_netscape(text).map_err(|e| CommandError::unknown(format!("{e:#}")))?;
    ensure_private_dir(&paths.auth_dir())?;
    write_private(&paths.cookies_file(), normalize_for_ytdlp(text).as_bytes())?;
    write_meta(paths, origin)?;
    info(paths).ok_or_else(|| CommandError::unknown("cookies written but unreadable"))
}

/// Record when and where the current cookies.txt came from.
pub(crate) fn write_meta(paths: &AppPaths, origin: &str) -> CmdResult<()> {
    let meta = Meta {
        created_at: chrono::Utc::now().to_rfc3339(),
        origin: origin.to_string(),
    };
    write_private(
        &meta_file(paths),
        &serde_json::to_vec(&meta).unwrap_or_default(),
    )
}

/// Copy `src` to a fresh owner-only file inside `dir` and return its path.
///
/// yt-dlp rewrites the `--cookies` jar on exit; handing it a per-run copy keeps a stale jar
/// from clobbering cookies the extension (or an import) wrote while it ran.
pub fn ephemeral_copy(src: &Path, dir: &Path) -> CmdResult<PathBuf> {
    let bytes = std::fs::read(src).map_err(|e| io_err(src, e))?;
    std::fs::create_dir_all(dir).map_err(|e| io_err(dir, e))?;
    let path = dir.join(format!("cookies-{}.txt", uuid::Uuid::new_v4().simple()));
    write_private_new(&path, &bytes)?;
    Ok(path)
}

/// Per-run cookie copy, deleted when dropped.
#[derive(Debug, Default)]
pub struct EphemeralJar(Option<PathBuf>);

impl EphemeralJar {
    pub fn path(&self) -> Option<&Path> {
        self.0.as_deref()
    }
}

impl Drop for EphemeralJar {
    fn drop(&mut self) {
        if let Some(p) = &self.0 {
            let _ = std::fs::remove_file(p);
        }
    }
}

/// `args` with the value of `--cookies <file>` replaced by an [`ephemeral_copy`] in `dir`.
/// Arguments without `--cookies` come back unchanged and nothing is written.
pub fn ephemeral_args(args: &[String], dir: &Path) -> CmdResult<(Vec<String>, EphemeralJar)> {
    let mut out = args.to_vec();
    let Some(i) = out.iter().position(|a| a == "--cookies") else {
        return Ok((out, EphemeralJar::default()));
    };
    let Some(src) = out.get(i + 1).cloned() else {
        return Ok((out, EphemeralJar::default()));
    };
    let copy = ephemeral_copy(Path::new(&src), dir)?;
    out[i + 1] = copy.to_string_lossy().into_owned();
    Ok((out, EphemeralJar(Some(copy))))
}

/// Ensure the magic header yt-dlp requires on the first line, and `\n` line ends.
fn normalize_for_ytdlp(text: &str) -> String {
    let body: Vec<&str> = text.lines().collect();
    let has_header = body
        .first()
        .is_some_and(|l| l.contains("HTTP Cookie File") && l.starts_with('#'));
    let mut out = String::with_capacity(text.len() + HEADER.len() + 1);
    if !has_header {
        out.push_str(HEADER);
        out.push('\n');
    }
    for l in body {
        out.push_str(l);
        out.push('\n');
    }
    out
}

pub fn info(paths: &AppPaths) -> Option<CookieFileInfo> {
    let file = paths.cookies_file();
    let text = std::fs::read_to_string(&file).ok()?;
    let (cookie_count, domains) = match parse_netscape(&text) {
        Ok(v) => v,
        Err(e) => {
            log::warn!("cookies.txt is unreadable: {e:#}");
            return None;
        }
    };
    let meta = std::fs::read(meta_file(paths))
        .ok()
        .and_then(|b| serde_json::from_slice::<Meta>(&b).ok());
    let (created_at, origin) = match meta {
        Some(m) => (m.created_at, m.origin),
        None => {
            let mtime = std::fs::metadata(&file)
                .and_then(|m| m.modified())
                .map(chrono::DateTime::<chrono::Utc>::from)
                .unwrap_or_else(|_| chrono::Utc::now());
            (mtime.to_rfc3339(), "import".into())
        }
    };
    Some(CookieFileInfo {
        created_at,
        origin,
        cookie_count,
        domains,
    })
}

pub fn clear(paths: &AppPaths) -> CmdResult<()> {
    for f in [paths.cookies_file(), meta_file(paths)] {
        match std::fs::remove_file(&f) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => {
                return Err(CommandError::new(
                    ErrorCode::PermissionDenied,
                    e.to_string(),
                ))
            }
        }
    }
    Ok(())
}

/// Run `--simulate` against a test URL with the given cookie args; classify failures
/// (cookie DB locked while the browser is open, app-bound decryption failure, bot check).
pub async fn test(tools: &Tools, cookie_args: &[String]) -> CookieTestResult {
    test_url(tools, cookie_args, TEST_URL).await
}

/// [`test`] against an arbitrary URL.
pub async fn test_url(tools: &Tools, cookie_args: &[String], url: &str) -> CookieTestResult {
    let Some(ytdlp) = tools.ytdlp.clone() else {
        return fail(ErrorCode::BinaryMissing, "yt-dlp is not installed");
    };
    let mut args: Vec<String> = vec![
        "--ignore-config".into(),
        "--simulate".into(),
        "--skip-download".into(),
        "--no-warnings".into(),
        "--no-playlist".into(),
        // Only authentication matters here, not whether a format can be picked.
        "--ignore-no-formats-error".into(),
    ];
    if let Some(rt) = &tools.js_runtime {
        let name = serde_json::to_value(rt.name)
            .ok()
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default();
        args.push("--js-runtimes".into());
        args.push(format!("{name}:{}", rt.path));
    }
    args.extend(cookie_args.iter().cloned());
    args.push("--".into());
    args.push(url.into());
    match run_ytdlp(&ytdlp, &args, TEST_TIMEOUT).await {
        Ok(r) if r.success => CookieTestResult {
            ok: true,
            error: None,
        },
        Ok(r) => CookieTestResult {
            ok: false,
            error: Some(classify(&r.stderr)),
        },
        Err(e) => fail(e.code, &e.detail),
    }
}

fn fail(code: ErrorCode, detail: &str) -> CookieTestResult {
    CookieTestResult {
        ok: false,
        error: Some(JobError {
            code,
            detail: detail.to_string(),
        }),
    }
}

/// Pure: validate + summarize a Netscape cookies.txt.
///
/// Accepts an optional header, comments, blank lines, CRLF and `#HttpOnly_` lines. Every other
/// line must have 7 tab-separated fields with TRUE/FALSE flags and a numeric expiry.
/// Returns (cookie count, sorted unique domains without the leading dot).
pub fn parse_netscape(text: &str) -> anyhow::Result<(u32, Vec<String>)> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let first = text.trim_start();
    anyhow::ensure!(
        !(first.starts_with('[') || first.starts_with('{')),
        "this looks like JSON; export cookies in Netscape (cookies.txt) format"
    );
    let mut count = 0u32;
    let mut domains = BTreeSet::new();
    for (i, raw) in text.lines().enumerate() {
        let line_no = i + 1;
        let line = raw.trim_end_matches('\r');
        let line = match line.strip_prefix("#HttpOnly_") {
            Some(rest) => rest,
            None if line.trim().is_empty() || line.starts_with('#') => continue,
            None => line,
        };
        let fields: Vec<&str> = line.split('\t').collect();
        anyhow::ensure!(
            fields.len() == 7,
            "line {line_no}: expected 7 tab-separated fields, found {}",
            fields.len()
        );
        let domain = fields[0].trim();
        anyhow::ensure!(!domain.is_empty(), "line {line_no}: empty domain");
        for (idx, what) in [(1, "include-subdomains"), (3, "secure")] {
            anyhow::ensure!(
                fields[idx].eq_ignore_ascii_case("TRUE")
                    || fields[idx].eq_ignore_ascii_case("FALSE"),
                "line {line_no}: {what} flag must be TRUE or FALSE"
            );
        }
        anyhow::ensure!(
            fields[4].chars().all(|c| c.is_ascii_digit()),
            "line {line_no}: expiry must be a number"
        );
        anyhow::ensure!(!fields[5].is_empty(), "line {line_no}: empty cookie name");
        count += 1;
        domains.insert(domain.trim_start_matches('.').to_ascii_lowercase());
    }
    anyhow::ensure!(count > 0, "no cookies found in file");
    Ok((count, domains.into_iter().collect()))
}

// ───────────────────────────── error classification ─────────────────────────────

/// Classify yt-dlp stderr from a cookie operation. Kept local on purpose (a handful of
/// cookie-specific patterns); the jobs classifier lives in `ytdlp::errors`.
pub fn classify(stderr: &str) -> JobError {
    let lower = stderr.to_ascii_lowercase();
    let has = |p: &str| lower.contains(p);
    let code = if has("could not copy chrome cookie database") || has("cookie database is locked") {
        ErrorCode::CookiesLocked
    } else if has("failed to decrypt")
        || has("cannot decrypt")
        || has("could not be decrypted")
        || has("app-bound")
        || has("app bound")
    {
        ErrorCode::CookiesDecrypt
    } else if has("not a bot") {
        ErrorCode::BotCheck
    } else if has("confirm your age") || has("age-restricted") || has("age restricted") {
        ErrorCode::AgeRestricted
    } else if has("private video") || has("video is private") {
        ErrorCode::Private
    } else if has("login required") || has("sign in") || has("log in") || has("--username") {
        ErrorCode::LoginRequired
    } else if has("unable to download")
        || has("getaddrinfo")
        || has("timed out")
        || has("connection")
        || has("network is unreachable")
        || has("name resolution")
    {
        ErrorCode::Network
    } else {
        ErrorCode::Unknown
    };
    JobError {
        code,
        detail: detail_line(stderr),
    }
}

fn classify_failure(stderr: &str) -> CommandError {
    let e = classify(stderr);
    CommandError::new(e.code, e.detail)
}

/// Last `ERROR:` line, else the last non-empty line.
fn detail_line(stderr: &str) -> String {
    let lines: Vec<&str> = stderr
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();
    lines
        .iter()
        .rev()
        .find(|l| l.starts_with("ERROR:"))
        .or_else(|| lines.last())
        .map(|l| l.to_string())
        .unwrap_or_default()
}

// ───────────────────────────── process + files ─────────────────────────────

struct RunOutput {
    success: bool,
    stderr: String,
}

async fn run_ytdlp(exe: &Path, args: &[String], timeout: Duration) -> CmdResult<RunOutput> {
    use tokio::io::AsyncReadExt;
    let mut child = crate::process::command(exe)
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            CommandError::new(ErrorCode::BinaryMissing, format!("{}: {e}", exe.display()))
        })?;
    let mut stderr = child.stderr.take().expect("piped stderr");
    let reader = tokio::spawn(async move {
        let mut buf = Vec::new();
        let _ = stderr.read_to_end(&mut buf).await;
        String::from_utf8_lossy(&buf).into_owned()
    });
    match tokio::time::timeout(timeout, child.wait()).await {
        Ok(status) => {
            let status = status.map_err(CommandError::unknown)?;
            let stderr = reader.await.unwrap_or_default();
            Ok(RunOutput {
                success: status.success(),
                stderr,
            })
        }
        Err(_) => {
            crate::process::kill_tree(&mut child).await;
            reader.abort();
            Err(CommandError::new(
                ErrorCode::Network,
                format!("yt-dlp did not finish within {}s", timeout.as_secs()),
            ))
        }
    }
}

/// Removes the file when dropped.
struct TempFile(PathBuf);

impl Drop for TempFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

fn io_err(path: &Path, e: std::io::Error) -> CommandError {
    let code = if e.kind() == std::io::ErrorKind::PermissionDenied {
        ErrorCode::PermissionDenied
    } else {
        ErrorCode::Unknown
    };
    CommandError::new(code, format!("{}: {e}", path.display()))
}

fn ensure_private_dir(dir: &Path) -> CmdResult<()> {
    std::fs::create_dir_all(dir).map_err(|e| io_err(dir, e))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))
            .map_err(|e| io_err(dir, e))?;
    }
    Ok(())
}

/// Create a new owner-only file (0600 on Unix) with `bytes`.
fn write_private_new(path: &Path, bytes: &[u8]) -> CmdResult<()> {
    use std::io::Write;
    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut f = opts.open(path).map_err(|e| io_err(path, e))?;
    f.write_all(bytes)
        .and_then(|_| f.sync_all())
        .map_err(|e| io_err(path, e))
}

/// Atomically replace `path` with an owner-only file containing `bytes`.
pub(crate) fn write_private(path: &Path, bytes: &[u8]) -> CmdResult<()> {
    let dir = path
        .parent()
        .ok_or_else(|| CommandError::unknown("path has no parent"))?;
    std::fs::create_dir_all(dir).map_err(|e| io_err(dir, e))?;
    let tmp = TempFile(dir.join(format!(
        ".{}.{}.tmp",
        path.file_name().and_then(|n| n.to_str()).unwrap_or("file"),
        uuid::Uuid::new_v4().simple()
    )));
    write_private_new(&tmp.0, bytes)?;
    std::fs::rename(&tmp.0, path).map_err(|e| io_err(path, e))
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID: &str = "# Netscape HTTP Cookie File\n\
# comment\n\
\n\
.example.com\tTRUE\t/\tTRUE\t2000000000\tSID\tsynthetic1\n\
#HttpOnly_.Example.com\tTRUE\t/\tFALSE\t0\tHSID\tsynthetic2\n\
sub.test.org\tFALSE\t/path\tFALSE\t1999999999\tempty_value\t\n";

    #[test]
    fn parse_valid() {
        let (n, d) = parse_netscape(VALID).unwrap();
        assert_eq!(n, 3);
        assert_eq!(d, vec!["example.com", "sub.test.org"]);
    }

    #[test]
    fn parse_crlf_bom_no_header() {
        let t = "\u{feff}.a.com\tTRUE\t/\tFALSE\t1\tn\tv\r\n";
        assert_eq!(parse_netscape(t).unwrap(), (1, vec!["a.com".to_string()]));
    }

    #[test]
    fn parse_rejects() {
        for (t, needle) in [
            ("", "no cookies"),
            ("# only comments\n", "no cookies"),
            ("[{\"domain\":\".a.com\"}]", "JSON"),
            (".a.com TRUE / FALSE 1 n v\n", "7 tab-separated"),
            (".a.com\tTRUE\t/\tFALSE\t1\tn\n", "found 6"),
            (".a.com\tYES\t/\tFALSE\t1\tn\tv\n", "TRUE or FALSE"),
            (".a.com\tTRUE\t/\tFALSE\tsoon\tn\tv\n", "expiry"),
            ("\tTRUE\t/\tFALSE\t1\tn\tv\n", "empty domain"),
        ] {
            let e = parse_netscape(t).unwrap_err().to_string();
            assert!(e.contains(needle), "{t:?}: {e}");
        }
    }

    #[test]
    fn normalize_adds_header_once() {
        let n = normalize_for_ytdlp(".a.com\tTRUE\t/\tFALSE\t1\tn\tv\r\n");
        assert_eq!(n, format!("{HEADER}\n.a.com\tTRUE\t/\tFALSE\t1\tn\tv\n"));
        let n2 = normalize_for_ytdlp("# HTTP Cookie File\n.a.com\tTRUE\t/\tFALSE\t1\tn\tv\n");
        assert!(n2.starts_with("# HTTP Cookie File\n.a.com"));
    }

    #[test]
    fn ephemeral_copy_is_private_and_independent() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("cookies.txt");
        std::fs::write(&src, VALID).unwrap();
        let tmp = dir.path().join("job");
        let a = ephemeral_copy(&src, &tmp).unwrap();
        let b = ephemeral_copy(&src, &tmp).unwrap();
        assert_ne!(a, b);
        assert_eq!(a.parent().unwrap(), tmp);
        assert_eq!(std::fs::read_to_string(&a).unwrap(), VALID);
        std::fs::write(&a, "clobbered").unwrap();
        assert_eq!(std::fs::read_to_string(&src).unwrap(), VALID);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&b).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600);
        }
        assert!(ephemeral_copy(&dir.path().join("missing"), &tmp).is_err());
    }

    #[test]
    fn ephemeral_args_rewrites_only_cookies() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("cookies.txt");
        std::fs::write(&src, VALID).unwrap();
        let tmp = dir.path().join("tmp");
        let s = |v: &[&str]| v.iter().map(|x| x.to_string()).collect::<Vec<_>>();

        let plain = s(&["--cookies-from-browser", "brave", "--netrc-cmd", "x"]);
        let (out, jar) = ephemeral_args(&plain, &tmp).unwrap();
        assert_eq!(out, plain);
        assert!(jar.path().is_none());
        assert!(!tmp.exists());

        let src_s = src.to_string_lossy().into_owned();
        let args = s(&["--cookies", &src_s, "--netrc-cmd", "x"]);
        let (out, jar) = ephemeral_args(&args, &tmp).unwrap();
        let copy = jar.path().unwrap().to_path_buf();
        assert_eq!(out[0], "--cookies");
        assert_eq!(out[1], copy.to_string_lossy());
        assert_eq!(&out[2..], &args[2..]);
        assert!(copy.starts_with(&tmp));
        assert_eq!(std::fs::read_to_string(&copy).unwrap(), VALID);
        drop(jar);
        assert!(!copy.exists());
        assert!(src.exists());

        // A trailing `--cookies` without a value is left alone.
        let dangling = s(&["--cookies"]);
        assert_eq!(ephemeral_args(&dangling, &tmp).unwrap().0, dangling);
    }

    #[test]
    fn store_writes_jar_and_meta() {
        let dir = tempfile::tempdir().unwrap();
        let p = AppPaths {
            bin_dir: dir.path().join("bin"),
            data_dir: dir.path().join("data"),
            config_dir: dir.path().join("config"),
        };
        assert!(store(&p, "# only a comment\n", "extension:brave").is_err());
        assert!(!p.cookies_file().exists());
        let info = store(&p, VALID, "extension:brave").unwrap();
        assert_eq!(info.origin, "extension:brave");
        assert_eq!(info.cookie_count, 3);
    }

    #[test]
    fn classify_patterns() {
        let c = |s: &str| classify(s).code;
        assert_eq!(
            c("Extracting cookies from brave\nERROR: Could not copy Chrome cookie database. See  https://github.com/yt-dlp/yt-dlp/issues/7271  for more info"),
            ErrorCode::CookiesLocked
        );
        assert_eq!(
            c("ERROR: Failed to decrypt with DPAPI. See  https://github.com/yt-dlp/yt-dlp/issues/10927  for more info"),
            ErrorCode::CookiesDecrypt
        );
        assert_eq!(
            c("WARNING: cannot decrypt v10 cookies: no key found"),
            ErrorCode::CookiesDecrypt
        );
        assert_eq!(
            c("ERROR: [youtube] x: Sign in to confirm you’re not a bot. Use --cookies-from-browser"),
            ErrorCode::BotCheck
        );
        assert_eq!(
            c("ERROR: [youtube] x: Sign in to confirm your age."),
            ErrorCode::AgeRestricted
        );
        assert_eq!(
            c("ERROR: [youtube] x: Private video. Sign in"),
            ErrorCode::Private
        );
        assert_eq!(
            c("ERROR: [vimeo] x: This video requires login. Use --username"),
            ErrorCode::LoginRequired
        );
        assert_eq!(
            c("ERROR: [generic] Unable to download webpage: <urlopen error [Errno 11001] getaddrinfo failed>"),
            ErrorCode::Network
        );
        assert_eq!(
            c("ERROR: could not find brave cookies database"),
            ErrorCode::Unknown
        );
        assert_eq!(classify("a\nERROR: first\nlater\n").detail, "ERROR: first");
        assert_eq!(classify("a\nb\n").detail, "b");
    }
}
