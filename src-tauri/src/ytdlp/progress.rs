//! Parses the lines yt-dlp prints with ymd's `--progress-template` / `--print`. Owner: B.
//!
//! Marker lines (see `args`):
//! - `YMD|{json}`: the download progress dict (`%(progress)j`), on stdout;
//! - `YMD_PP|started|Merger`: postprocessor progress, on **stderr** (quiet mode);
//! - `YMD_META|<title>`, `YMD_ITEM|<n>|<count>`: before each item is downloaded;
//! - `YMD_FILE|<path>`: final path after all post-processing.
//!
//! Plain yt-dlp log lines (`[download] Downloading item 3 of 12`, `[Merger] …`) are also
//! understood so the parser stays useful if quiet mode is ever turned off.
//! Anything else (garbage, partial lines, warnings) yields `None`.

use super::args::{FILE_PREFIX, ITEM_PREFIX, META_PREFIX, PP_PREFIX, PROGRESS_PREFIX};
use crate::model::JobStage;
use serde_json::Value;

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
    let line = line.trim_matches(|c| c == '\r' || c == '\n' || c == '\u{feff}');
    if let Some(rest) = line.strip_prefix(PROGRESS_PREFIX) {
        return parse_progress(rest);
    }
    if let Some(rest) = line.strip_prefix(PP_PREFIX) {
        let mut parts = rest.splitn(2, '|');
        let status = parts.next()?.trim();
        let name = parts.next()?.trim();
        return match status {
            "started" | "processing" => Some(Event::Stage(pp_stage(name))),
            _ => None,
        };
    }
    if let Some(rest) = line.strip_prefix(META_PREFIX) {
        return present(rest).map(|t| Event::Title(t.to_string()));
    }
    if let Some(rest) = line.strip_prefix(ITEM_PREFIX) {
        let (a, b) = rest.split_once('|')?;
        return playlist_item(a, b);
    }
    if let Some(rest) = line.strip_prefix(FILE_PREFIX) {
        return present(rest).map(|p| Event::File(p.to_string()));
    }
    parse_log_line(line)
}

/// `NA` / empty → `None`.
fn present(v: &str) -> Option<&str> {
    let t = v.trim();
    (!t.is_empty() && t != "NA" && t != "None").then_some(t)
}

fn playlist_item(index: &str, count: &str) -> Option<Event> {
    let index: u32 = present(index)?.parse().ok()?;
    let count: u32 = present(count)?.parse().ok()?;
    (index > 0 && count > 0).then_some(Event::PlaylistItem { index, count })
}

fn pp_stage(name: &str) -> JobStage {
    match name {
        "Merger" | "FFmpegMerger" => JobStage::Merging,
        _ => JobStage::Postprocessing,
    }
}

/// A number from the progress dict: JSON numbers, or numeric strings; `NA`/null/negative → None.
fn num(v: Option<&Value>) -> Option<f64> {
    let n = match v? {
        Value::Number(n) => n.as_f64()?,
        Value::String(s) => s.trim().trim_end_matches('%').trim().parse().ok()?,
        _ => return None,
    };
    (n.is_finite() && n >= 0.0).then_some(n)
}

fn parse_progress(json: &str) -> Option<Event> {
    let v: Value = serde_json::from_str(json.trim()).ok()?;
    let obj = v.as_object()?;
    let status = obj
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("downloading");
    if status == "error" {
        return None;
    }
    let downloaded = num(obj.get("downloaded_bytes")).map(|n| n as u64);
    let total = num(obj.get("total_bytes"))
        .or_else(|| num(obj.get("total_bytes_estimate")))
        .filter(|t| *t > 0.0)
        .map(|n| n as u64);
    let speed = num(obj.get("speed"));
    let eta = num(obj.get("eta")).map(|n| n.round() as u64);

    let fraction = if status == "finished" {
        Some(1.0)
    } else {
        match (downloaded, total) {
            (Some(d), Some(t)) => Some(d as f64 / t as f64),
            _ => num(obj.get("_percent"))
                .or_else(|| num(obj.get("_percent_str")))
                .map(|p| p / 100.0)
                .or_else(|| {
                    let i = num(obj.get("fragment_index"))?;
                    let c = num(obj.get("fragment_count")).filter(|c| *c > 0.0)?;
                    Some(i / c)
                }),
        }
    }
    .map(|f| f.clamp(0.0, 1.0));

    Some(Event::Progress {
        stage: JobStage::Downloading,
        downloaded,
        total,
        speed,
        eta,
        fraction,
    })
}

/// Postprocessor tags yt-dlp prints as `[Tag] ...` in non-quiet mode.
const PP_TAGS: &[&str] = &[
    "ExtractAudio",
    "EmbedThumbnail",
    "EmbedSubtitle",
    "Metadata",
    "SponsorBlock",
    "ModifyChapters",
    "ThumbnailsConvertor",
    "VideoConvertor",
    "VideoRemuxer",
    "SubtitlesConvertor",
    "FixupM3u8",
    "FixupM4a",
    "FixupStretched",
    "FixupDuration",
    "FixupDuplicateMoov",
    "FixupTimestamp",
    "SplitChapters",
    "Concat",
];

fn parse_log_line(line: &str) -> Option<Event> {
    let line = line.trim();
    if let Some(rest) = line.strip_prefix("[download] Downloading ") {
        // "item 3 of 12" (current) / "video 3 of 12" (older yt-dlp)
        let rest = rest
            .strip_prefix("item ")
            .or_else(|| rest.strip_prefix("video "))?;
        let (a, b) = rest.split_once(" of ")?;
        return playlist_item(a, b.split_whitespace().next()?);
    }
    let tag = line.strip_prefix('[')?.split_once(']')?.0;
    if tag == "Merger" {
        return Some(Event::Stage(JobStage::Merging));
    }
    PP_TAGS
        .contains(&tag)
        .then_some(Event::Stage(JobStage::Postprocessing))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn progress(e: Option<Event>) -> (Option<u64>, Option<u64>, Option<f64>, Option<u64>, f64) {
        match e {
            Some(Event::Progress {
                downloaded,
                total,
                speed,
                eta,
                fraction,
                stage,
            }) => {
                assert_eq!(stage, JobStage::Downloading);
                (downloaded, total, speed, eta, fraction.unwrap())
            }
            other => panic!("not progress: {other:?}"),
        }
    }

    #[test]
    fn bytes_and_total() {
        let (d, t, s, e, f) = progress(parse_line(
            r#"YMD|{"status": "downloading", "downloaded_bytes": 500, "total_bytes": 1000, "speed": 12.5, "eta": 3.6}"#,
        ));
        assert_eq!((d, t, s, e), (Some(500), Some(1000), Some(12.5), Some(4)));
        assert!((f - 0.5).abs() < 1e-9);
    }

    #[test]
    fn estimate_when_total_missing() {
        let (_, t, s, e, f) = progress(parse_line(
            r#"YMD|{"status": "downloading", "downloaded_bytes": 250, "total_bytes": null, "total_bytes_estimate": 1000.0, "speed": null, "eta": null}"#,
        ));
        assert_eq!((t, s, e), (Some(1000), None, None));
        assert!((f - 0.25).abs() < 1e-9);
    }

    #[test]
    fn percent_string_fallback_and_na() {
        let (d, t, _, _, f) = progress(parse_line(
            r#"YMD|{"status": "downloading", "downloaded_bytes": "NA", "total_bytes": "NA", "_percent_str": "  42.0%", "eta": "NA"}"#,
        ));
        assert_eq!((d, t), (None, None));
        assert!((f - 0.42).abs() < 1e-9);
        let (_, _, _, _, f) = progress(parse_line(
            r#"YMD|{"status": "downloading", "fragment_index": 3, "fragment_count": 12}"#,
        ));
        assert!((f - 0.25).abs() < 1e-9);
    }

    #[test]
    fn finished_is_full_and_clamped() {
        let (_, _, _, _, f) = progress(parse_line(r#"YMD|{"status": "finished"}"#));
        assert_eq!(f, 1.0);
        let (_, _, _, _, f) = progress(parse_line(
            r#"YMD|{"downloaded_bytes": 2000, "total_bytes": 1000}"#,
        ));
        assert_eq!(f, 1.0);
        assert_eq!(parse_line(r#"YMD|{"status": "error"}"#), None);
    }

    #[test]
    fn garbage_and_partial_lines() {
        for l in [
            "",
            "YMD|",
            "YMD|{\"status\": \"downl",
            "YMD|[1,2]",
            "YMD_PP|started",
            "YMD_ITEM|NA|NA",
            "YMD_ITEM|3",
            "YMD_META|NA",
            "YMD_FILE|",
            "WARNING: something",
            "[youtube] Extracting URL",
            "[download] Destination: x.mp4",
            "random \u{1b}[0m noise",
        ] {
            assert_eq!(parse_line(l), None, "{l:?}");
        }
    }

    #[test]
    fn markers() {
        assert_eq!(
            parse_line("YMD_PP|started|Merger\r"),
            Some(Event::Stage(JobStage::Merging))
        );
        assert_eq!(
            parse_line("YMD_PP|started|ExtractAudio"),
            Some(Event::Stage(JobStage::Postprocessing))
        );
        assert_eq!(parse_line("YMD_PP|finished|Merger"), None);
        assert_eq!(
            parse_line("YMD_META|A | title with pipes"),
            Some(Event::Title("A | title with pipes".into()))
        );
        assert_eq!(
            parse_line("YMD_ITEM|02|17"),
            Some(Event::PlaylistItem {
                index: 2,
                count: 17
            })
        );
        assert_eq!(
            parse_line(r"YMD_FILE|C:\Users\user\Videos\Caminandes 3： Llamigos [SkVqJ1SGeL0].mp4"),
            Some(Event::File(
                r"C:\Users\user\Videos\Caminandes 3： Llamigos [SkVqJ1SGeL0].mp4".into()
            ))
        );
    }

    #[test]
    fn plain_log_lines() {
        assert_eq!(
            parse_line("[download] Downloading item 3 of 12"),
            Some(Event::PlaylistItem {
                index: 3,
                count: 12
            })
        );
        assert_eq!(
            parse_line("[download] Downloading video 1 of 2"),
            Some(Event::PlaylistItem { index: 1, count: 2 })
        );
        assert_eq!(
            parse_line("[Merger] Merging formats into \"x.mp4\""),
            Some(Event::Stage(JobStage::Merging))
        );
        assert_eq!(
            parse_line("[ExtractAudio] Destination: x.mp3"),
            Some(Event::Stage(JobStage::Postprocessing))
        );
    }
}
