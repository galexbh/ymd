//! Parsers against real yt-dlp output (captured with yt-dlp 2026.08.19 on Windows from Blender's
//! CC-BY "Big Buck Bunny" and the "Official Blender Open Movies" playlist; local paths and signed
//! media URLs sanitized). See `tests/fixtures/ytdlp/` and `tests/fixtures/stderr/`.

use std::path::PathBuf;
use ymd_lib::model::{ErrorCode, JobStage, ProbeKind};
use ymd_lib::ytdlp::errors;
use ymd_lib::ytdlp::probe;
use ymd_lib::ytdlp::progress::{parse_line, Event};

fn fixture(rel: &str) -> String {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(rel);
    std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("{}: {e}", p.display()))
}

/// Events from a captured run: stdout lines, then stderr lines (postprocessor markers).
fn events(name: &str) -> (Vec<Event>, Vec<Event>, usize) {
    let out = fixture(&format!("ytdlp/{name}.stdout.txt"));
    let err = fixture(&format!("ytdlp/{name}.stderr.txt"));
    let progress_lines = out.lines().filter(|l| l.starts_with("YMD|")).count();
    (
        out.lines().filter_map(parse_line).collect(),
        err.lines().filter_map(parse_line).collect(),
        progress_lines,
    )
}

fn fractions(evs: &[Event]) -> Vec<f64> {
    evs.iter()
        .filter_map(|e| match e {
            Event::Progress { fraction, .. } => *fraction,
            _ => None,
        })
        .collect()
}

#[test]
fn real_video_download() {
    let (out, err, n) = events("download_video_mp4");
    let progress = out
        .iter()
        .filter(|e| matches!(e, Event::Progress { .. }))
        .count();
    assert_eq!(progress, n, "every progress line parses");
    assert_eq!(out[0], Event::Title("Big Buck Bunny".into()));
    assert!(!out.iter().any(|e| matches!(e, Event::PlaylistItem { .. })));
    // Two streams (video then audio); each ends with a 100 % "downloading" line followed by a
    // "finished" line, and progress restarts from ~0 for the second stream.
    let f = fractions(&out);
    assert_eq!(f.iter().filter(|x| **x == 1.0).count(), 4, "{f:?}");
    let restarts = f.windows(2).filter(|w| w[1] < w[0]).count();
    assert_eq!(restarts, 1, "{f:?}");
    assert!(f.iter().all(|x| (0.0..=1.0).contains(x)));
    match out.iter().find(|e| {
        matches!(
            e,
            Event::Progress {
                total: Some(_),
                speed: Some(_),
                eta: Some(_),
                ..
            }
        )
    }) {
        Some(Event::Progress { total, .. }) => assert!(total.unwrap() > 1_000_000),
        _ => panic!("no progress with total/speed/eta"),
    }
    assert_eq!(
        out.last(),
        Some(&Event::File(
            r"C:\Users\user\Videos\Big Buck Bunny [YE7VzlLtp-4].mp4".into()
        ))
    );
    assert_eq!(err[0], Event::Stage(JobStage::Merging));
    assert!(err[1..]
        .iter()
        .all(|e| *e == Event::Stage(JobStage::Postprocessing)));
}

#[test]
fn real_audio_extraction() {
    let (out, err, n) = events("download_audio_mp3");
    assert_eq!(fractions(&out).len(), n);
    assert_eq!(fractions(&out).last(), Some(&1.0));
    assert!(matches!(out.last(), Some(Event::File(p)) if p.ends_with(".mp3")));
    assert_eq!(
        err.len(),
        4,
        "ExtractAudio, Metadata, EmbedThumbnail, MoveFiles"
    );
    assert!(err
        .iter()
        .all(|e| *e == Event::Stage(JobStage::Postprocessing)));
}

#[test]
fn real_playlist_items() {
    let (out, err, _) = events("download_playlist_items");
    let items: Vec<_> = out
        .iter()
        .filter(|e| matches!(e, Event::PlaylistItem { .. }))
        .cloned()
        .collect();
    assert_eq!(
        items,
        [
            Event::PlaylistItem { index: 1, count: 2 },
            Event::PlaylistItem { index: 2, count: 2 }
        ]
    );
    let files: Vec<_> = out
        .iter()
        .filter_map(|e| match e {
            Event::File(p) => Some(p.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(files.len(), 2);
    assert!(files[0].contains(r"Official Blender Open Movies\08 - The Daily Dweebs"));
    assert!(files[1].contains(r"Official Blender Open Movies\10 - Caminandes 3： Llamigos"));
    assert!(!err.is_empty());
}

#[test]
fn every_error_code_has_a_classified_fixture() {
    use ErrorCode::*;
    let codes = [
        BotCheck,
        AgeRestricted,
        LoginRequired,
        Private,
        Unavailable,
        Geoblocked,
        FfmpegMissing,
        JsRuntimeMissing,
        UnsupportedUrl,
        Network,
        CookiesLocked,
        CookiesDecrypt,
        DiskFull,
        PermissionDenied,
        Unknown,
    ];
    for code in codes {
        let name = serde_json::to_value(code).unwrap();
        let text = fixture(&format!("stderr/{}.txt", name.as_str().unwrap()));
        assert_eq!(errors::classify(&text), code, "fixture {name}");
        let e = errors::to_job_error(&text);
        assert_eq!(e.code, code);
        assert!(e.detail.starts_with("ERROR:"), "{name}: {}", e.detail);
    }
}

#[test]
fn real_probe_video() {
    let json: serde_json::Value = serde_json::from_str(&fixture("ytdlp/probe_video.json")).unwrap();
    let r = probe::parse(&json, "https://www.youtube.com/watch?v=YE7VzlLtp-4").unwrap();
    assert_eq!(r.kind, ProbeKind::Video);
    assert_eq!(r.title, "Big Buck Bunny");
    assert_eq!(r.id.as_deref(), Some("YE7VzlLtp-4"));
    assert_eq!(r.uploader.as_deref(), Some("Blender"));
    assert_eq!(r.duration, Some(597.0));
    assert_eq!(r.max_height, Some(1080));
    assert_eq!(
        r.thumbnail.as_deref(),
        Some("https://i.ytimg.com/vi/YE7VzlLtp-4/maxresdefault.jpg")
    );
    assert!(r.entries.is_empty());
    assert!(r.formats.iter().all(|f| f.ext != "mhtml"));
    assert!(r.formats.iter().any(|f| f.format_id == "140"
        && f.acodec.is_some()
        && f.vcodec.is_none()
        && f.height.is_none()));
    insta::assert_json_snapshot!("probe_video", r);
}

#[test]
fn real_probe_playlist() {
    let json: serde_json::Value =
        serde_json::from_str(&fixture("ytdlp/probe_playlist.json")).unwrap();
    let url = "https://www.youtube.com/playlist?list=PL6B3937A5D230E335";
    let r = probe::parse(&json, url).unwrap();
    assert_eq!(r.kind, ProbeKind::Playlist);
    assert_eq!(r.title, "Official Blender Open Movies");
    assert_eq!(r.entries.len(), 17);
    for (i, e) in r.entries.iter().enumerate() {
        assert_eq!(e.index as usize, i + 1);
        assert!(e.thumbnail.is_some() && e.url.is_some() && e.title.is_some());
    }
    assert_eq!(
        r.entries[9].title.as_deref(),
        Some("Caminandes 3: Llamigos")
    );
    assert!(r.thumbnail.is_some());
    assert!(r.formats.is_empty());
    insta::assert_json_snapshot!("probe_playlist", r);
}
