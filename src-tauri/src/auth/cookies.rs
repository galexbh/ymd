//! cookies.txt snapshot / import / test / clear. Owner: C.
//! The file lives at `AppPaths::cookies_file()` with owner-only permissions (0600 / user ACL).

use crate::deps::Tools;
use crate::model::{Browser, CmdResult, CookieFileInfo, CookieTestResult};
use crate::paths::AppPaths;

/// Dump the browser's cookies once into ymd's own cookies.txt via
/// `yt-dlp --cookies-from-browser B[:P] --cookies <file> --skip-download <probe-url>`.
pub async fn snapshot(
    tools: &Tools,
    paths: &AppPaths,
    browser: Browser,
    profile: Option<&str>,
) -> CmdResult<CookieFileInfo> {
    let _ = (tools, paths, browser, profile);
    todo!("C")
}

/// Copy a user-provided Netscape cookies.txt into place after validating its format.
pub fn import(paths: &AppPaths, source: &std::path::Path) -> CmdResult<CookieFileInfo> {
    let _ = (paths, source);
    todo!("C")
}

pub fn info(paths: &AppPaths) -> Option<CookieFileInfo> {
    let _ = paths;
    todo!("C")
}

pub fn clear(paths: &AppPaths) -> CmdResult<()> {
    let _ = paths;
    todo!("C")
}

/// Run `--simulate` against a test URL with the given cookie args; classify failures
/// (cookie DB locked while the browser is open, app-bound decryption failure, bot check).
pub async fn test(tools: &Tools, cookie_args: &[String]) -> CookieTestResult {
    let _ = (tools, cookie_args);
    todo!("C")
}

/// Pure: validate + summarize a Netscape cookies.txt.
pub fn parse_netscape(text: &str) -> anyhow::Result<(u32, Vec<String>)> {
    let _ = text;
    todo!("C")
}
