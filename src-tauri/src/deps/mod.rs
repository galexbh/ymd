//! Managed toolchain: yt-dlp, ffmpeg/ffprobe, Deno, aria2c, AtomicParsley.
//! Owner: deps agent (A).

pub mod archive;
pub mod catalog;
pub mod github;
pub mod jsruntime;
pub mod manager;
pub mod manifest;
pub mod verify;
pub mod version;

use crate::model::JsRuntimeInfo;
use std::path::PathBuf;

/// Resolved tool locations handed to every yt-dlp invocation.
#[derive(Debug, Clone, Default)]
pub struct Tools {
    pub ytdlp: Option<PathBuf>,
    /// Directory containing ffmpeg + ffprobe (for `--ffmpeg-location`).
    pub ffmpeg_dir: Option<PathBuf>,
    pub js_runtime: Option<JsRuntimeInfo>,
    pub aria2c: Option<PathBuf>,
    pub atomicparsley: Option<PathBuf>,
}
