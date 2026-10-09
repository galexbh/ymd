//! Authentication, in layers. Owner: auth agent (C).
//! 1. cookies (`--cookies-from-browser` live, or a snapshot / imported cookies.txt);
//! 2. site accounts in the OS keychain, handed to yt-dlp through `--netrc-cmd` with ymd itself as
//!    the helper (`ymd --netrc-helper <extractor>`), so passwords never touch disk or argv;
//! 3. transient `--video-password` / `--twofactor` from the enqueue request (memory only).

pub mod browsers;
pub mod cookies;
pub mod keychain;
pub mod netrc;

use crate::model::{CookieSource, EnqueueRequest};
use crate::paths::AppPaths;

/// argv for a request: cookies + netrc-cmd (when any credential is stored) + transient secrets.
pub fn args_for(
    source: &CookieSource,
    paths: &AppPaths,
    has_credentials: bool,
    helper_exe: &std::path::Path,
    req: Option<&EnqueueRequest>,
) -> Vec<String> {
    let _ = (source, paths, has_credentials, helper_exe, req);
    todo!("C")
}
