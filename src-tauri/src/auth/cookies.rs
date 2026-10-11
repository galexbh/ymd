//! ymd's cookies.txt (written by the ymd Cookies extension through the native host) / test /
//! clear. Owner: C. There is no manual import: a hand-exported cookies.txt carries every session
//! in plain text, so ymd does not accept one.
//! The file lives at `AppPaths::cookies_file()` with owner-only permissions (0600 / user ACL),
//! sealed with a key from the OS keychain (see `super::jar`); every read and write of it goes
//! through `read_jar` / `write_jar`.
//!
//! Permissions: on Unix every file is created 0600 (and the auth dir 0700) before any byte is
//! written. On Windows the file lives under `%APPDATA%\<id>\auth`, whose inherited ACL already
//! grants access only to the user, SYSTEM and Administrators, so no extra ACL work is done.

use crate::deps::Tools;
use crate::model::{
    CmdResult, CommandError, CookieFileInfo, CookieTestResult, ErrorCode, JobError,
};
use crate::paths::AppPaths;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashSet};
use std::path::{Path, PathBuf};
use std::time::Duration;

const HEADER: &str = "# Netscape HTTP Cookie File";
const TEST_TIMEOUT: Duration = Duration::from_secs(90);
/// How long stderr may stay open after yt-dlp exited.
const PIPE_GRACE: Duration = Duration::from_secs(5);
/// Public, long-lived video used by "Test cookies".
pub const TEST_URL: &str = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Meta {
    created_at: String,
    origin: String,
    /// Manifest version of the extension that wrote the jar (`None` when it sent no valid one).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    extension_version: Option<String>,
}

fn meta_file(paths: &AppPaths) -> PathBuf {
    paths.auth_dir().join("cookies.meta.json")
}

/// Advisory lock file guarding the jar + meta pair: two browsers can sync at once (each
/// through its own native-host process), and their writes must not interleave.
fn lock_file(paths: &AppPaths) -> PathBuf {
    paths.auth_dir().join(".cookies.lock")
}

/// Holds the exclusive lock on [`lock_file`] until dropped.
struct JarLock(#[allow(dead_code)] std::fs::File);

/// Exclusive lock on the jar (waits for another writer). `try_only`: give up at once (`None`)
/// when another process holds it.
fn lock_jar(paths: &AppPaths, try_only: bool) -> CmdResult<Option<JarLock>> {
    let path = lock_file(paths);
    let file = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(&path)
        .map_err(|e| io_err(&path, e))?;
    if try_only {
        return match file.try_lock() {
            Ok(()) => Ok(Some(JarLock(file))),
            Err(std::fs::TryLockError::WouldBlock) => Ok(None),
            Err(std::fs::TryLockError::Error(e)) => Err(io_err(&path, e)),
        };
    }
    file.lock().map_err(|e| io_err(&path, e))?;
    Ok(Some(JarLock(file)))
}

/// Whether `name` is a temp file of [`write_private`] (`.<file>.<32 hex>.tmp`).
fn is_write_temp_name(name: &str) -> bool {
    name.strip_prefix('.')
        .and_then(|rest| rest.strip_suffix(".tmp"))
        .and_then(|rest| rest.rsplit_once('.'))
        .is_some_and(|(file, id)| {
            !file.is_empty() && id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit())
        })
}

/// Deletes temp files an interrupted atomic write left in the auth dir (they may hold a plain
/// or sealed jar). Skipped while a native host holds the jar lock. Returns how many went.
pub fn sweep_auth_temps(paths: &AppPaths) -> usize {
    let dir = paths.auth_dir();
    if !dir.is_dir() {
        return 0;
    }
    let Ok(Some(_lock)) = lock_jar(paths, true) else {
        return 0;
    };
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return 0;
    };
    entries
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .filter(|e| is_write_temp_name(&e.file_name().to_string_lossy()))
        .filter(|e| std::fs::remove_file(e.path()).is_ok())
        .count()
}

/// Write `text` (a Netscape jar) as ymd's cookies.txt plus its meta, both owner-only and
/// atomic, after validating it, recording the manifest version of the extension that sent the
/// jar. Used by the native-messaging host (`origin = "extension:<browser>"`).
pub fn store_from_extension(
    paths: &AppPaths,
    text: &str,
    origin: &str,
    extension_version: Option<&str>,
) -> CmdResult<CookieFileInfo> {
    parse_netscape(text).map_err(|e| CommandError::unknown(format!("{e:#}")))?;
    ensure_private_dir(&paths.auth_dir())?;
    // Jar, meta and the summary read back belong to the same sync.
    let _lock = lock_jar(paths, false)?;
    write_jar(paths, &normalize_for_ytdlp(text))?;
    write_meta(paths, origin, extension_version)?;
    info(paths).ok_or_else(|| CommandError::unknown("cookies written but unreadable"))
}

/// Record when and where the current cookies.txt came from.
pub(crate) fn write_meta(
    paths: &AppPaths,
    origin: &str,
    extension_version: Option<&str>,
) -> CmdResult<()> {
    let meta = Meta {
        created_at: chrono::Utc::now().to_rfc3339(),
        origin: origin.to_string(),
        extension_version: extension_version.map(str::to_string),
    };
    write_private(
        &meta_file(paths),
        &serde_json::to_vec(&meta).unwrap_or_default(),
    )
}

/// Copy `src` to a fresh owner-only file inside `dir` and return its path.
///
/// yt-dlp rewrites the `--cookies` jar on exit; handing it a per-run copy keeps a stale jar
/// from clobbering cookies the extension wrote while it ran.
pub fn ephemeral_copy(src: &Path, dir: &Path) -> CmdResult<PathBuf> {
    let bytes = std::fs::read(src).map_err(|e| io_err(src, e))?;
    // yt-dlp needs plain Netscape text: this copy is the only place it exists on disk.
    let bytes = super::jar::decode(&bytes, super::jar::key().as_ref())
        .map_err(|e| CommandError::unknown(format!("{e:#}")))?;
    std::fs::create_dir_all(dir).map_err(|e| io_err(dir, e))?;
    let path = dir.join(format!("cookies-{}.txt", uuid::Uuid::new_v4().simple()));
    write_private_new(&path, &bytes)?;
    Ok(path)
}

/// Whether `name` is a per-run copy written by [`ephemeral_copy`].
fn is_ephemeral_name(name: &str) -> bool {
    name.strip_prefix("cookies-")
        .and_then(|rest| rest.strip_suffix(".txt"))
        .is_some_and(|id| id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit()))
}

/// Deletes per-run plain copies left in `tmp_dir` (and its job folders) by a crash or a forced
/// quit. Run at start-up, before any job can own one. Returns how many were removed.
pub fn sweep_stale_copies(tmp_dir: &Path) -> usize {
    sweep_stale_copies_while_running(tmp_dir, Duration::ZERO, &HashSet::new())
}

/// Copies older than any probe or cookie test can run: the periodic sweep removes only these.
pub const STALE_COPY_AGE: Duration = Duration::from_secs(30 * 60);

/// [`sweep_stale_copies`] for a running app: the job folders named in `skip` (running jobs,
/// whose yt-dlp still uses its copy) are left alone, and elsewhere only copies last written at
/// least `min_age` ago go (a probe or a cookie test may still be using a newer one).
pub fn sweep_stale_copies_while_running(
    tmp_dir: &Path,
    min_age: Duration,
    skip: &HashSet<String>,
) -> usize {
    let old_enough = |path: &Path| {
        min_age.is_zero()
            || std::fs::metadata(path)
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.elapsed().ok())
                .is_some_and(|age| age >= min_age)
    };
    let mut removed = 0;
    let mut dirs = vec![tmp_dir.to_path_buf()];
    let mut depth = 0;
    while !dirs.is_empty() && depth < 3 {
        let mut next = Vec::new();
        for dir in dirs {
            let Ok(entries) = std::fs::read_dir(&dir) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                let Ok(kind) = entry.file_type() else {
                    continue;
                };
                if kind.is_dir() {
                    if depth > 0 || !skip.contains(&*entry.file_name().to_string_lossy()) {
                        next.push(path);
                    }
                } else if kind.is_file()
                    && is_ephemeral_name(&entry.file_name().to_string_lossy())
                    && old_enough(&path)
                    && std::fs::remove_file(&path).is_ok()
                {
                    removed += 1;
                }
            }
        }
        dirs = next;
        depth += 1;
    }
    removed
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
    /// Windows can hold the file a moment after yt-dlp exits: retry briefly, then leave it to
    /// the periodic / start-up sweep (`sweep_stale_copies*`).
    fn drop(&mut self) {
        let Some(p) = &self.0 else { return };
        for attempt in 0..5 {
            match std::fs::remove_file(p) {
                Ok(()) => return,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => return,
                Err(_) if attempt < 4 => std::thread::sleep(Duration::from_millis(40)),
                Err(e) => log::warn!("cookie copy not deleted yet ({e}); the sweep will retry"),
            }
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

/// Plain text of ymd's jar (decrypted when sealed). `None` when there is no jar.
fn read_jar(paths: &AppPaths) -> Option<anyhow::Result<String>> {
    let bytes = std::fs::read(paths.cookies_file()).ok()?;
    Some(
        super::jar::decode(&bytes, super::jar::key().as_ref())
            .map(|plain| String::from_utf8_lossy(&plain).into_owned()),
    )
}

/// Write ymd's jar, sealed when the keychain allows (owner-only and atomic either way).
fn write_jar(paths: &AppPaths, text: &str) -> CmdResult<()> {
    let bytes = super::jar::encode(text.as_bytes(), super::jar::key().as_ref())
        .map_err(|e| CommandError::unknown(format!("{e:#}")))?;
    write_private(&paths.cookies_file(), &bytes)
}

pub fn info(paths: &AppPaths) -> Option<CookieFileInfo> {
    let file = paths.cookies_file();
    let text = match read_jar(paths)? {
        Ok(t) => t,
        Err(e) => {
            log::warn!("cookies.txt is unreadable: {e:#}");
            return None;
        }
    };
    let (cookie_count, domains) = match parse_netscape(&text) {
        Ok(v) => v,
        Err(e) => {
            log::warn!("cookies.txt is unreadable: {e:#}");
            return None;
        }
    };
    let meta = read_meta(paths);
    let (created_at, origin) = match meta {
        Some(m) => (m.created_at, m.origin),
        None => {
            let mtime = std::fs::metadata(&file)
                .and_then(|m| m.modified())
                .map(chrono::DateTime::<chrono::Utc>::from)
                .unwrap_or_else(|_| chrono::Utc::now());
            (mtime.to_rfc3339(), "unknown".into())
        }
    };
    Some(CookieFileInfo {
        created_at,
        origin,
        cookie_count,
        domains,
        signed_in: signed_in(&text),
    })
}

fn read_meta(paths: &AppPaths) -> Option<Meta> {
    std::fs::read(meta_file(paths))
        .ok()
        .and_then(|b| serde_json::from_slice::<Meta>(&b).ok())
}

/// Manifest version of the extension that wrote the current jar. `None` without a jar meta or
/// without a valid version in it.
pub fn extension_version(paths: &AppPaths) -> Option<String> {
    read_meta(paths)?.extension_version
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

/// Sites whose session can be told from cookie names alone, and the names that prove it.
/// YouTube keeps `LOGIN_INFO` and the `SAPISID` pair only while you are signed in.
const SESSION_RULES: &[(&str, &[&str])] = &[(
    "youtube.com",
    &["LOGIN_INFO", "SAPISID", "__Secure-3PAPISID"],
)];

/// Pure: sites with a signed-in session in a Netscape jar, judged by cookie *names* only
/// (values are never looked at).
pub fn signed_in(text: &str) -> Vec<String> {
    let rows: Vec<(String, &str)> = text
        .lines()
        .filter_map(|raw| {
            let line = raw.trim_end_matches('\r');
            let line = line.strip_prefix("#HttpOnly_").unwrap_or(line);
            if line.starts_with('#') {
                return None;
            }
            let f: Vec<&str> = line.split('\t').collect();
            (f.len() == 7).then(|| {
                let domain = f[0].trim().trim_start_matches('.').to_ascii_lowercase();
                (domain, f[5])
            })
        })
        .collect();
    SESSION_RULES
        .iter()
        .filter(|(site, names)| {
            rows.iter().any(|(domain, name)| {
                (domain == site || domain.ends_with(&format!(".{site}"))) && names.contains(name)
            })
        })
        .map(|(site, _)| (*site).to_string())
        .collect()
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
            // A child yt-dlp left behind may keep stderr open: don't wait for it forever.
            let stderr = match tokio::time::timeout(PIPE_GRACE, reader).await {
                Ok(text) => text.unwrap_or_default(),
                Err(_) => String::new(),
            };
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
    fn signed_in_reads_names_only() {
        let signed = "# Netscape HTTP Cookie File\n\
#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\tLOGIN_INFO\tx\n\
.youtube.com\tTRUE\t/\tTRUE\t0\tPREF\ty\n";
        assert_eq!(signed_in(signed), vec!["youtube.com".to_string()]);
        let sub = "www.youtube.com\tFALSE\t/\tTRUE\t0\t__Secure-3PAPISID\tz\n";
        assert_eq!(signed_in(sub), vec!["youtube.com".to_string()]);
        // signed out: only preferences; a look-alike domain doesn't count; values don't matter
        for t in [
            ".youtube.com\tTRUE\t/\tTRUE\t0\tPREF\tLOGIN_INFO\n",
            ".notyoutube.com\tTRUE\t/\tTRUE\t0\tLOGIN_INFO\tx\n",
            "# .youtube.com\tTRUE\t/\tTRUE\t0\tLOGIN_INFO\tx\n",
            "",
        ] {
            assert!(signed_in(t).is_empty(), "{t:?}");
        }
    }

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
    fn sweep_removes_only_left_over_copies() {
        let tmp = tempfile::tempdir().unwrap();
        let job = tmp.path().join("job1");
        std::fs::create_dir_all(&job).unwrap();
        let copy = ephemeral_copy(
            &{
                let src = tmp.path().join("src.txt");
                std::fs::write(&src, "x").unwrap();
                src
            },
            &job,
        )
        .unwrap();
        let keep = [
            tmp.path().join("src.txt"),
            job.join("video.mp4.part"),
            job.join("cookies-notahexid.txt"),
            job.join("cookies.txt"),
        ];
        for k in &keep[1..] {
            std::fs::write(k, "x").unwrap();
        }
        assert_eq!(sweep_stale_copies(tmp.path()), 1);
        assert!(!copy.exists());
        for k in &keep {
            assert!(k.exists(), "{}", k.display());
        }
        assert_eq!(sweep_stale_copies(&tmp.path().join("missing")), 0);
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
    fn auth_temp_files_are_swept_unless_a_host_writes() {
        let dir = tempfile::tempdir().unwrap();
        let p = AppPaths {
            bin_dir: dir.path().join("bin"),
            data_dir: dir.path().join("data"),
            config_dir: dir.path().join("config"),
        };
        assert_eq!(sweep_auth_temps(&p), 0, "no auth dir yet");
        let auth = p.auth_dir();
        std::fs::create_dir_all(&auth).unwrap();
        let id = uuid::Uuid::new_v4().simple().to_string();
        let stale = [
            auth.join(format!(".cookies.txt.{id}.tmp")),
            auth.join(format!(".cookies.meta.json.{id}.tmp")),
        ];
        let keep = [
            auth.join("cookies.txt"),
            auth.join("accounts.json"),
            auth.join(".cookies.txt.nothex.tmp"),
            auth.join(format!("cookies.txt.{id}.tmp")),
        ];
        for f in stale.iter().chain(&keep) {
            std::fs::write(f, "x").unwrap();
        }
        // A native host in the middle of a write holds the lock: nothing is touched.
        let held = lock_jar(&p, false).unwrap();
        assert!(lock_jar(&p, true).unwrap().is_none());
        assert_eq!(sweep_auth_temps(&p), 0);
        drop(held);
        assert_eq!(sweep_auth_temps(&p), 2);
        assert!(stale.iter().all(|f| !f.exists()));
        assert!(keep.iter().all(|f| f.exists()));
    }

    #[test]
    fn concurrent_syncs_keep_jar_and_meta_together() {
        let dir = tempfile::tempdir().unwrap();
        let p = std::sync::Arc::new(AppPaths {
            bin_dir: dir.path().join("bin"),
            data_dir: dir.path().join("data"),
            config_dir: dir.path().join("config"),
        });
        let jar = |browser: &str, n: usize| {
            (0..n)
                .map(|i| format!(".{browser}.com\tTRUE\t/\tTRUE\t0\tc{i}\tv\n"))
                .collect::<String>()
        };
        let threads: Vec<_> = [("brave", 3usize), ("edge", 5usize)]
            .into_iter()
            .map(|(browser, n)| {
                let p = p.clone();
                let text = jar(browser, n);
                std::thread::spawn(move || {
                    for _ in 0..20 {
                        store_from_extension(&p, &text, &format!("extension:{browser}"), None)
                            .unwrap();
                    }
                })
            })
            .collect();
        for t in threads {
            t.join().unwrap();
        }
        let info = info(&p).unwrap();
        let expected = match info.origin.as_str() {
            "extension:brave" => 3,
            "extension:edge" => 5,
            other => panic!("{other}"),
        };
        assert_eq!(info.cookie_count, expected, "meta matches the jar");
        let leftovers: Vec<_> = std::fs::read_dir(p.auth_dir())
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "{leftovers:?}");
    }

    #[test]
    fn periodic_sweep_spares_fresh_copies() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src.txt");
        std::fs::write(&src, "x").unwrap();
        let none = HashSet::new();
        let fresh = ephemeral_copy(&src, tmp.path()).unwrap();
        let running: String = "0b5c5e5a-1d8e-4a52-9a43-6f4f1c6f0e01".into();
        let in_job = ephemeral_copy(&src, &tmp.path().join(&running)).unwrap();
        let in_done_job = ephemeral_copy(&src, &tmp.path().join("other")).unwrap();
        let tiny = Duration::from_nanos(1);
        std::thread::sleep(Duration::from_millis(20));
        assert_eq!(
            sweep_stale_copies_while_running(tmp.path(), STALE_COPY_AGE, &none),
            0
        );
        assert!(fresh.exists());
        let skip: HashSet<String> = [running].into_iter().collect();
        assert_eq!(sweep_stale_copies_while_running(tmp.path(), tiny, &skip), 2);
        assert!(!fresh.exists() && !in_done_job.exists());
        assert!(in_job.exists(), "a running job keeps its copy");
    }

    #[test]
    fn store_writes_jar_and_meta() {
        let dir = tempfile::tempdir().unwrap();
        let p = AppPaths {
            bin_dir: dir.path().join("bin"),
            data_dir: dir.path().join("data"),
            config_dir: dir.path().join("config"),
        };
        let comment_only = "# only a comment\n";
        assert!(store_from_extension(&p, comment_only, "extension:brave", Some("1.4.3")).is_err());
        assert!(!p.cookies_file().exists());
        assert_eq!(extension_version(&p), None);
        let info = store_from_extension(&p, VALID, "extension:brave", None).unwrap();
        assert_eq!(info.origin, "extension:brave");
        assert_eq!(info.cookie_count, 3);
        assert_eq!(
            extension_version(&p),
            None,
            "an invalid version is not stored"
        );
        let meta = std::fs::read_to_string(meta_file(&p)).unwrap();
        assert!(!meta.contains("extensionVersion"), "{meta}");

        let edge = store_from_extension(&p, VALID, "extension:edge", Some("1.4.1")).unwrap();
        assert_eq!(edge.origin, "extension:edge");
        assert_eq!(extension_version(&p).as_deref(), Some("1.4.1"));
        let meta = std::fs::read_to_string(meta_file(&p)).unwrap();
        assert!(meta.contains(r#""extensionVersion":"1.4.1""#), "{meta}");

        clear(&p).unwrap();
        assert_eq!(extension_version(&p), None);
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
