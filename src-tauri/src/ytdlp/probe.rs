//! `yt-dlp -J` → `ProbeResult`. Owner: B.

use crate::deps::Tools;
use crate::model::{CmdResult, ProbeResult};

/// Run yt-dlp and parse. Errors are classified with `errors::classify`.
pub async fn probe(url: &str, tools: &Tools, auth_args: &[String]) -> CmdResult<ProbeResult> {
    let _ = (url, tools, auth_args);
    todo!("B")
}

/// Pure: map yt-dlp's info JSON (single video or playlist) to `ProbeResult`.
pub fn parse(json: &serde_json::Value, url: &str) -> anyhow::Result<ProbeResult> {
    let _ = (json, url);
    todo!("B")
}
