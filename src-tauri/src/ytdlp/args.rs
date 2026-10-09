//! Pure argv builder. Never goes through a shell. Snapshot-tested per preset. Owner: B.

use crate::deps::Tools;
use crate::model::Preset;
use std::path::PathBuf;

/// Marker prefixes ymd parses from yt-dlp stdout.
pub const PROGRESS_PREFIX: &str = "YMD|";
pub const FILE_PREFIX: &str = "YMD_FILE|";
pub const META_PREFIX: &str = "YMD_META|";

#[derive(Debug, Clone)]
pub struct DownloadSpec<'a> {
    pub url: &'a str,
    pub preset: &'a Preset,
    pub tools: &'a Tools,
    pub output_dir: PathBuf,
    pub tmp_dir: PathBuf,
    pub filename_template: &'a str,
    /// `None` = `--no-playlist`; `Some(empty)` = whole playlist; else `--playlist-items`.
    pub playlist_items: Option<&'a [u32]>,
    /// `--download-archive <path>` when enabled.
    pub archive_file: Option<PathBuf>,
    pub use_aria2c: bool,
    /// Already-built auth args from `auth::args_for` (cookies / netrc-cmd / video password / 2FA).
    pub auth_args: Vec<String>,
}

/// Full argv (without the program) for a download.
pub fn download_args(spec: &DownloadSpec) -> Vec<String> {
    let _ = spec;
    todo!("B")
}

/// argv for `probe`: `-J` (+ `--flat-playlist`), plus tools and auth args.
pub fn probe_args(url: &str, tools: &Tools, auth_args: &[String]) -> Vec<String> {
    let _ = (url, tools, auth_args);
    todo!("B")
}

/// Shared tool flags: `--ffmpeg-location`, `--js-runtimes`, `--no-js-runtimes` reset, etc.
pub fn tool_args(tools: &Tools) -> Vec<String> {
    let _ = tools;
    todo!("B")
}
