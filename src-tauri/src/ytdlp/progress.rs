//! Parses the lines yt-dlp prints with ymd's `--progress-template` / `--print`. Owner: B.

use crate::model::JobStage;

#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    Progress {
        stage: JobStage,
        downloaded: Option<u64>,
        total: Option<u64>,
        speed: Option<f64>,
        eta: Option<u64>,
        /// 0.0 – 1.0
        fraction: Option<f64>,
    },
    /// `[download] Downloading item 3 of 12`
    PlaylistItem { index: u32, count: u32 },
    /// `[Merger]` / `[ExtractAudio]` / `[EmbedThumbnail]` ...
    Stage(JobStage),
    /// Final file path after all post-processing.
    File(String),
    /// Title known (from `--print before_dl:YMD_META|...`).
    Title(String),
}

pub fn parse_line(line: &str) -> Option<Event> {
    let _ = line;
    todo!("B")
}
