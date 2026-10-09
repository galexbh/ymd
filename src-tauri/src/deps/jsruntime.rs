//! JS runtime detection for yt-dlp-ejs. Owner: A.
//! Priority: managed Deno in bin dir, then deno, node, bun, qjs on PATH.

use crate::model::{JsRuntimeInfo, JsRuntimeName};
use std::path::Path;

/// All runtimes found, highest priority first.
pub async fn detect(bin_dir: &Path) -> Vec<JsRuntimeInfo> {
    let _ = bin_dir;
    todo!("A")
}

/// The `--js-runtimes` value for yt-dlp, e.g. `node:C:\Program Files\nodejs\node.exe`.
pub fn ytdlp_arg(rt: &JsRuntimeInfo) -> String {
    let name = match rt.name {
        JsRuntimeName::Deno => "deno",
        JsRuntimeName::Node => "node",
        JsRuntimeName::Bun => "bun",
        JsRuntimeName::Quickjs => "quickjs",
    };
    format!("{name}:{}", rt.path)
}
