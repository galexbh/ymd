//! Pure argv builder. Never goes through a shell. Snapshot-tested per preset. Owner: B.
//!
//! Behaviour confirmed against yt-dlp 2026.08.19 (Windows, `yt-dlp.exe`):
//! - `--progress-template "download:YMD|%(progress)j"` prints the progress dict as one JSON line
//!   on **stdout** (`info_dict` stripped; `speed`/`eta` are `null` until known).
//! - `--print` implies `--quiet`, so the `postprocess:` progress template is written to
//!   **stderr** (yt-dlp's "screen" stream in quiet mode). Readers must parse markers on both streams.
//! - `--print before_dl:...` / `after_move:...` do not imply `--simulate` (later stages than
//!   `video`), so no `--no-simulate` is needed; it is passed anyway to stay explicit.
//! - Everything after `--` is a URL: `-- -notanoption` yields "'-notanoption' is not a valid URL".
//! - `%(playlist_index)s` is zero-padded to the playlist size ("08", "10").

use crate::deps::{jsruntime, Tools};
use crate::model::{AudioFormat, AudioOptions, MediaKind, Preset, VideoContainer};
use std::ffi::OsString;
use std::path::{Path, PathBuf};

/// Marker prefixes ymd parses from yt-dlp output.
pub const PROGRESS_PREFIX: &str = "YMD|";
pub const FILE_PREFIX: &str = "YMD_FILE|";
pub const META_PREFIX: &str = "YMD_META|";
/// `YMD_ITEM|<position in queue>|<items in queue>` (playlists only; `NA` otherwise).
pub const ITEM_PREFIX: &str = "YMD_ITEM|";
/// `YMD_PP|<started|processing|finished>|<PostProcessor name>` (stderr).
pub const PP_PREFIX: &str = "YMD_PP|";

pub const PROGRESS_TEMPLATE: &str = "download:YMD|%(progress)j";
pub const PP_TEMPLATE: &str = "postprocess:YMD_PP|%(progress.status)s|%(progress.postprocessor)s";
pub const META_PRINT: &str = "before_dl:YMD_META|%(title)s";
pub const ITEM_PRINT: &str = "before_dl:YMD_ITEM|%(playlist_autonumber)s|%(n_entries)s";
pub const FILE_PRINT: &str = "after_move:YMD_FILE|%(filepath)s";

/// Prefix added to the filename template for playlist downloads: one folder per playlist,
/// items numbered by their playlist position.
pub const PLAYLIST_TEMPLATE_PREFIX: &str =
    "%(playlist,playlist_id|playlist)s/%(playlist_index)s - ";
/// Used when settings carry an empty template.
pub const DEFAULT_FILENAME_TEMPLATE: &str = "%(title)s [%(id)s].%(ext)s";
/// Fragment concurrency (`-N`).
pub const CONCURRENT_FRAGMENTS: &str = "4";
pub const ARIA2C_ARGS: &str = "aria2c:-x 8 -s 8 -k 1M";

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
    /// Download speed cap in MB/s (`--limit-rate <n>M`, and aria2c's overall limit when it is
    /// the downloader). `None` = unlimited.
    pub limit_rate_mbps: Option<u32>,
    /// Already-built auth args from `auth::args_for` (cookies / netrc-cmd / video password / 2FA).
    pub auth_args: Vec<String>,
}

fn s(v: &str) -> String {
    v.to_string()
}

fn p(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// Flags every invocation shares: no user config, no colors, UTF-8 output.
fn base_args() -> Vec<String> {
    vec![
        s("--ignore-config"),
        s("--color"),
        s("never"),
        s("--encoding"),
        s("utf-8"),
    ]
}

/// Full argv (without the program) for a download.
pub fn download_args(spec: &DownloadSpec) -> Vec<String> {
    let mut a = base_args();

    // Machine-readable progress.
    a.extend([
        s("--newline"),
        s("--progress"),
        s("--no-simulate"),
        s("--progress-template"),
        s(PROGRESS_TEMPLATE),
        s("--progress-template"),
        s(PP_TEMPLATE),
        s("--print"),
        s(META_PRINT),
        s("--print"),
        s(ITEM_PRINT),
        s("--print"),
        s(FILE_PRINT),
    ]);

    // Where files go.
    let template = if spec.filename_template.trim().is_empty() {
        DEFAULT_FILENAME_TEMPLATE
    } else {
        spec.filename_template
    };
    let template = match spec.playlist_items {
        Some(_) => format!("{PLAYLIST_TEMPLATE_PREFIX}{template}"),
        None => template.to_string(),
    };
    a.extend([
        s("-P"),
        format!("home:{}", p(&spec.output_dir)),
        s("-P"),
        format!("temp:{}", p(&spec.tmp_dir)),
        s("-o"),
        template,
        s("--windows-filenames"),
        s("-N"),
        s(CONCURRENT_FRAGMENTS),
    ]);
    if let Some(archive) = &spec.archive_file {
        a.extend([s("--download-archive"), p(archive)]);
    }
    let rate = spec.limit_rate_mbps.filter(|n| *n > 0);
    if let Some(n) = rate {
        a.extend([s("--limit-rate"), format!("{n}M")]);
    }

    a.extend(tool_args(spec.tools));
    if spec.use_aria2c {
        if let Some(aria) = &spec.tools.aria2c {
            a.extend([
                s("--downloader"),
                p(aria),
                s("--downloader-args"),
                aria2c_args(rate),
            ]);
        }
    }

    a.extend(format_args(spec.preset));
    a.extend(postprocess_args(spec.preset));
    a.extend(playlist_args(spec.playlist_items));
    a.extend(spec.auth_args.iter().cloned());

    a.push(s("--"));
    a.push(spec.url.to_string());
    a
}

/// `--downloader-args` value for aria2c. With a speed cap it is handed to aria2c explicitly, so
/// the cap holds whichever downloader runs (the value equals `--limit-rate`'s, so a duplicate
/// forwarded by yt-dlp is harmless).
pub fn aria2c_args(limit_rate_mbps: Option<u32>) -> String {
    match limit_rate_mbps {
        Some(n) => format!("{ARIA2C_ARGS} --max-overall-download-limit={n}M"),
        None => ARIA2C_ARGS.to_string(),
    }
}

/// `-f` / `-S` / merge or audio extraction for a preset.
pub fn format_args(preset: &Preset) -> Vec<String> {
    match preset.kind {
        MediaKind::Video => {
            let v = &preset.video;
            let format = match v.max_height {
                Some(h) => format!("bv*[height<={h}]+ba/b[height<={h}]"),
                None => s("bv*+ba/b"),
            };
            let sort = match v.container {
                VideoContainer::Mp4 => "res,ext:mp4:m4a",
                VideoContainer::Webm => "res,ext:webm:webm",
                VideoContainer::Mkv | VideoContainer::Any => "res",
            };
            let mut a = vec![s("-f"), format, s("-S"), s(sort)];
            let merge = match v.container {
                VideoContainer::Mp4 => Some("mp4"),
                VideoContainer::Mkv => Some("mkv"),
                VideoContainer::Webm => Some("webm"),
                VideoContainer::Any => None,
            };
            if let Some(m) = merge {
                a.extend([s("--merge-output-format"), s(m)]);
            }
            a
        }
        MediaKind::Audio => {
            let au = &preset.audio;
            let mut a = vec![s("-f"), s("ba/b"), s("-x")];
            let fmt = match au.format {
                AudioFormat::Best => None,
                AudioFormat::Mp3 => Some("mp3"),
                AudioFormat::M4a => Some("m4a"),
                AudioFormat::Opus => Some("opus"),
                AudioFormat::Flac => Some("flac"),
            };
            // `Best` keeps the original stream (no re-encode), so quality is meaningless there.
            if let Some(f) = fmt {
                a.extend([s("--audio-format"), s(f)]);
                if !au.quality.trim().is_empty() {
                    a.extend([s("--audio-quality"), au.quality.trim().to_string()]);
                }
            }
            a
        }
    }
}

/// `--parse-metadata` rule for "Split artist and title". It runs at `post_process` (after the
/// filename is fixed, before the metadata is embedded), so only the tags change. Titles not
/// shaped "Artist - Title" (a hyphen, en dash or em dash between spaces) are left as they are:
/// yt-dlp prints "Could not interpret 'title' as …" and keeps going.
pub const SPLIT_ARTIST_TITLE: &str = r"post_process:title:(?P<artist>.+?)\s+[-–—]\s+(?P<title>.+)";
/// `--convert-thumbnails` mapping for "Square cover". yt-dlp skips the conversion (and with it
/// the crop below) when the thumbnail already has the target format, so JPEG thumbnails become
/// PNG and everything else becomes JPEG.
pub const SQUARE_COVER_FORMAT: &str = "jpg>png/jpeg>png/jpg";
/// `--ppa` for "Square cover": center-crop to the shorter side while converting the thumbnail.
/// yt-dlp splits the value with shlex (the double quotes keep the filter as one argument) and
/// ffmpeg's filter parser reads the single quotes (so the commas are not filter separators).
pub const SQUARE_COVER_PPA: &str =
    r#"ThumbnailsConvertor+ffmpeg_o:-vf "crop='min(iw,ih)':'min(iw,ih)'""#;
/// ffmpeg output options for "Normalize volume": single-pass EBU R128 loudnorm to -14 LUFS.
/// loudnorm upsamples to 192 kHz internally, so the output rate is set explicitly.
pub const NORMALIZE_VOLUME_FILTER: &str = "-af loudnorm=I=-14:TP=-1.5:LRA=11 -ar 48000";

/// `--ppa` for "Normalize volume", applied while yt-dlp extracts the audio (`ExtractAudio`).
///
/// When the downloaded codec already matches the chosen format (opus → Opus, AAC → M4A, …),
/// yt-dlp stream-copies (`-acodec copy`), and ffmpeg rejects a filter on a copied stream. The
/// encoder and quality are therefore repeated after the filter, mirroring yt-dlp 2026.08's
/// `FFmpegExtractAudioPP._quality_args`, so the audio is always re-encoded as the preset says
/// (when yt-dlp already re-encodes, the repeated options are the same ones). `None` for
/// `AudioFormat::Best`, which keeps the original stream. If the downloaded file already has the
/// target extension and codec (an .mp3 for MP3), yt-dlp skips extraction and the volume is kept.
pub fn normalize_volume_ppa(audio: &AudioOptions) -> Option<String> {
    let encoder = match audio.format {
        AudioFormat::Best => return None,
        AudioFormat::Mp3 => "libmp3lame",
        AudioFormat::M4a => "aac",
        AudioFormat::Opus => "libopus",
        AudioFormat::Flac => "flac",
    };
    let mut v = format!("ExtractAudio:{NORMALIZE_VOLUME_FILTER} -c:a {encoder}");
    // yt-dlp's default `--audio-quality` is 5; "320K" means 320 (a bitrate above 10).
    let q = audio.quality.trim().trim_end_matches(['k', 'K']);
    let q: f64 = if q.is_empty() {
        5.0
    } else {
        q.parse().unwrap_or(5.0)
    };
    if q > 10.0 {
        v.push_str(&format!(" -b:a {q}k"));
    } else {
        let limits = match audio.format {
            AudioFormat::Mp3 => Some((10.0, 0.0)),
            AudioFormat::M4a => Some((0.1, 4.0)),
            _ => None,
        };
        if let Some((worst, best)) = limits {
            // Rounded so float noise (0.10000000000000009) stays out of the argv.
            let scaled: f64 = ((best + (worst - best) * (q / 10.0)) * 1000.0).round() / 1000.0;
            v.push_str(&format!(" -q:a {scaled}"));
        }
    }
    Some(v)
}

/// Embedding, SponsorBlock and the audio tidy-up options.
///
/// The audio-only options are ignored for video presets, and each one only applies when it can
/// have an effect: splitting the title needs embedded metadata, the square cover needs an
/// embedded thumbnail, and loudness normalization needs a re-encode (not `AudioFormat::Best`).
/// Each `--ppa` is scoped to its own postprocessor, so neither reaches the other nor
/// SponsorBlock's `ModifyChapters`.
pub fn postprocess_args(preset: &Preset) -> Vec<String> {
    let pp = &preset.postprocess;
    let mut a = Vec::new();
    if pp.embed_thumbnail {
        a.push(s("--embed-thumbnail"));
    }
    if pp.embed_metadata {
        a.push(s("--embed-metadata"));
    }
    if pp.embed_subs && preset.kind == MediaKind::Video {
        a.push(s("--embed-subs"));
        if !pp.sub_langs.trim().is_empty() {
            a.extend([s("--sub-langs"), pp.sub_langs.trim().to_string()]);
        }
    }
    let cats: Vec<&str> = pp
        .sponsorblock_remove
        .iter()
        .map(|c| c.trim())
        .filter(|c| !c.is_empty())
        .collect();
    if !cats.is_empty() {
        a.extend([s("--sponsorblock-remove"), cats.join(",")]);
    }
    if preset.kind == MediaKind::Audio {
        if pp.split_artist_title && pp.embed_metadata {
            a.extend([s("--parse-metadata"), s(SPLIT_ARTIST_TITLE)]);
        }
        if pp.square_cover && pp.embed_thumbnail {
            a.extend([
                s("--convert-thumbnails"),
                s(SQUARE_COVER_FORMAT),
                s("--ppa"),
                s(SQUARE_COVER_PPA),
            ]);
        }
        if pp.normalize_volume {
            if let Some(ppa) = normalize_volume_ppa(&preset.audio) {
                a.extend([s("--ppa"), ppa]);
            }
        }
    }
    a
}

pub fn playlist_args(items: Option<&[u32]>) -> Vec<String> {
    match items {
        None => vec![s("--no-playlist")],
        Some([]) => vec![s("--yes-playlist")],
        Some(items) => {
            let list: Vec<String> = items.iter().map(u32::to_string).collect();
            vec![s("--yes-playlist"), s("--playlist-items"), list.join(",")]
        }
    }
}

/// argv for `probe`: `-J` (+ `--flat-playlist`), plus tools and auth args.
///
/// `--no-playlist` makes an ambiguous `watch?v=…&list=…` URL resolve to the single video,
/// while a pure playlist URL still returns the playlist (with flat entries).
pub fn probe_args(url: &str, tools: &Tools, auth_args: &[String]) -> Vec<String> {
    let mut a = base_args();
    a.extend([
        s("-J"),
        s("--flat-playlist"),
        s("--no-playlist"),
        s("--no-warnings"),
    ]);
    a.extend(tool_args(tools));
    a.extend(auth_args.iter().cloned());
    a.push(s("--"));
    a.push(url.to_string());
    a
}

/// Shared tool flags: `--ffmpeg-location`, `--js-runtimes`, `--no-js-runtimes` reset, etc.
///
/// yt-dlp only enables `deno` by default; when ymd picked a runtime it clears the defaults and
/// enables exactly that one (so the managed Node.js, or a system runtime, is actually used).
pub fn tool_args(tools: &Tools) -> Vec<String> {
    let mut a = Vec::new();
    if let Some(dir) = &tools.ffmpeg_dir {
        a.extend([s("--ffmpeg-location"), p(dir)]);
    }
    if let Some(rt) = &tools.js_runtime {
        a.extend([
            s("--no-js-runtimes"),
            s("--js-runtimes"),
            jsruntime::ytdlp_arg(rt),
        ]);
    }
    a
}

/// Environment for every yt-dlp child: force UTF-8 I/O, and put optional helpers that yt-dlp
/// only finds on `PATH` (AtomicParsley, aria2c) in front of it.
pub fn child_env(tools: &Tools) -> Vec<(OsString, OsString)> {
    let mut env = vec![
        (OsString::from("PYTHONUTF8"), OsString::from("1")),
        (OsString::from("PYTHONIOENCODING"), OsString::from("utf-8")),
    ];
    let extra: Vec<PathBuf> = [&tools.atomicparsley, &tools.aria2c]
        .into_iter()
        .flatten()
        .filter_map(|exe| exe.parent().map(Path::to_path_buf))
        .filter(|d| !d.as_os_str().is_empty())
        .collect();
    if !extra.is_empty() {
        let current = std::env::var_os("PATH").unwrap_or_default();
        let dirs = extra
            .into_iter()
            .chain(std::env::split_paths(&current).collect::<Vec<_>>());
        if let Ok(joined) = std::env::join_paths(dirs) {
            env.push((OsString::from("PATH"), joined));
        }
    }
    env
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{AudioOptions, JsRuntimeInfo, JsRuntimeName, PostProcess, VideoOptions};

    fn pp_default() -> PostProcess {
        PostProcess {
            embed_thumbnail: true,
            embed_metadata: true,
            embed_subs: false,
            sub_langs: String::new(),
            sponsorblock_remove: vec![],
            split_artist_title: false,
            square_cover: false,
            normalize_volume: false,
        }
    }

    fn pp_all() -> PostProcess {
        PostProcess {
            embed_thumbnail: true,
            embed_metadata: true,
            embed_subs: true,
            sub_langs: "es.*,en.*".into(),
            sponsorblock_remove: vec!["sponsor".into(), " selfpromo ".into(), "".into()],
            split_artist_title: true,
            square_cover: true,
            normalize_volume: true,
        }
    }

    fn pp_off() -> PostProcess {
        PostProcess {
            embed_thumbnail: false,
            embed_metadata: false,
            embed_subs: false,
            sub_langs: String::new(),
            sponsorblock_remove: vec![],
            split_artist_title: false,
            square_cover: false,
            normalize_volume: false,
        }
    }

    fn video(id: &str, h: Option<u32>, c: VideoContainer) -> Preset {
        Preset {
            id: id.into(),
            name: id.into(),
            kind: MediaKind::Video,
            video: VideoOptions {
                max_height: h,
                container: c,
            },
            audio: AudioOptions {
                format: AudioFormat::Best,
                quality: "0".into(),
            },
            postprocess: pp_default(),
            output_dir: None,
            builtin: true,
        }
    }

    fn audio(id: &str, f: AudioFormat, q: &str) -> Preset {
        Preset {
            id: id.into(),
            name: id.into(),
            kind: MediaKind::Audio,
            video: VideoOptions {
                max_height: None,
                container: VideoContainer::Any,
            },
            audio: AudioOptions {
                format: f,
                quality: q.into(),
            },
            postprocess: pp_default(),
            output_dir: None,
            builtin: true,
        }
    }

    fn presets() -> Vec<Preset> {
        vec![
            video("best", None, VideoContainer::Any),
            video("mp4-1080", Some(1080), VideoContainer::Mp4),
            video("mp4-720", Some(720), VideoContainer::Mp4),
            audio("mp3-320", AudioFormat::Mp3, "320K"),
            audio("audio-original", AudioFormat::Best, "0"),
        ]
    }

    struct Paths {
        out: &'static str,
        tmp: &'static str,
        archive: &'static str,
        tools: Tools,
    }

    fn windows() -> Paths {
        Paths {
            out: r"C:\Users\user\Videos",
            tmp: r"C:\Users\user\AppData\Roaming\com.ymd.app\tmp\job-1",
            archive: r"C:\Users\user\AppData\Roaming\com.ymd.app\download-archive.txt",
            tools: Tools {
                ytdlp: Some(r"C:\Users\user\AppData\Local\ymd\bin\yt-dlp.exe".into()),
                ffmpeg_dir: Some(r"C:\Users\user\AppData\Local\ymd\bin".into()),
                js_runtime: Some(JsRuntimeInfo {
                    name: JsRuntimeName::Node,
                    path: r"C:\Users\user\AppData\Local\ymd\bin\node.exe".into(),
                    version: Some("24.21.0".into()),
                    managed: true,
                }),
                aria2c: Some(r"C:\Users\user\AppData\Local\ymd\bin\aria2c.exe".into()),
                atomicparsley: None,
            },
        }
    }

    fn unix() -> Paths {
        Paths {
            out: "/home/user/Videos",
            tmp: "/home/user/.local/share/com.ymd.app/tmp/job-1",
            archive: "/home/user/.local/share/com.ymd.app/download-archive.txt",
            tools: Tools {
                ytdlp: Some("/home/user/.local/share/com.ymd.app/bin/yt-dlp".into()),
                ffmpeg_dir: Some("/usr/bin".into()),
                js_runtime: Some(JsRuntimeInfo {
                    name: JsRuntimeName::Node,
                    path: "/usr/bin/node".into(),
                    version: Some("22.0.0".into()),
                    managed: false,
                }),
                aria2c: None,
                atomicparsley: None,
            },
        }
    }

    const URL: &str = "https://www.youtube.com/watch?v=YE7VzlLtp-4";
    const TEMPLATE: &str = "%(title)s [%(id)s].%(ext)s";

    fn spec<'a>(
        preset: &'a Preset,
        paths: &'a Paths,
        playlist: Option<&'a [u32]>,
        archive: bool,
        aria2c: bool,
        auth: Vec<String>,
    ) -> DownloadSpec<'a> {
        DownloadSpec {
            url: URL,
            preset,
            tools: &paths.tools,
            output_dir: paths.out.into(),
            tmp_dir: paths.tmp.into(),
            filename_template: TEMPLATE,
            playlist_items: playlist,
            archive_file: archive.then(|| paths.archive.into()),
            use_aria2c: aria2c,
            limit_rate_mbps: None,
            auth_args: auth,
        }
    }

    #[test]
    fn snapshot_each_preset_windows() {
        let w = windows();
        for preset in presets() {
            let args = download_args(&spec(&preset, &w, None, false, false, vec![]));
            insta::assert_yaml_snapshot!(format!("download_{}_windows", preset.id), args);
        }
    }

    #[test]
    fn snapshot_each_preset_unix() {
        let u = unix();
        for preset in presets() {
            let args = download_args(&spec(&preset, &u, None, false, false, vec![]));
            insta::assert_yaml_snapshot!(format!("download_{}_unix", preset.id), args);
        }
    }

    #[test]
    fn snapshot_combos() {
        let w = windows();
        let presets = presets();
        let mp4 = &presets[1];
        let mp3 = &presets[3];
        let auth = vec![
            "--cookies-from-browser".to_string(),
            "brave:Default".to_string(),
            "--video-password".to_string(),
            "hunter2".to_string(),
        ];
        let items: &[u32] = &[1, 3, 7];
        let cases: Vec<(&str, DownloadSpec)> = vec![
            (
                "playlist_all",
                spec(mp4, &w, Some(&[]), false, false, vec![]),
            ),
            (
                "playlist_some",
                spec(mp4, &w, Some(items), false, false, vec![]),
            ),
            ("archive_on", spec(mp4, &w, None, true, false, vec![])),
            ("aria2c_on", spec(mp4, &w, None, false, true, vec![])),
            ("auth", spec(mp4, &w, None, false, false, auth.clone())),
            (
                "everything_mp3",
                spec(mp3, &w, Some(items), true, true, auth),
            ),
        ];
        let mut rate = spec(mp4, &w, None, false, false, vec![]);
        rate.limit_rate_mbps = Some(5);
        let mut rate_aria = spec(mp4, &w, None, false, true, vec![]);
        rate_aria.limit_rate_mbps = Some(20);
        let cases = cases
            .into_iter()
            .chain([("rate_on", rate), ("rate_aria2c", rate_aria)]);
        for (name, s) in cases {
            insta::assert_yaml_snapshot!(format!("download_combo_{name}"), download_args(&s));
        }
    }

    #[test]
    fn snapshot_postprocess_on_off() {
        let w = windows();
        for (pp_name, pp) in [("all", pp_all()), ("off", pp_off())] {
            for mut preset in [
                video("mp4-1080", Some(1080), VideoContainer::Mp4),
                audio("mp3-320", AudioFormat::Mp3, "320K"),
            ] {
                preset.postprocess = pp.clone();
                let args = download_args(&spec(&preset, &w, None, false, false, vec![]));
                insta::assert_yaml_snapshot!(format!("download_pp_{pp_name}_{}", preset.id), args);
            }
        }
    }

    fn tidy(split: bool, square: bool, normalize: bool) -> PostProcess {
        PostProcess {
            split_artist_title: split,
            square_cover: square,
            normalize_volume: normalize,
            ..pp_default()
        }
    }

    #[test]
    fn snapshot_audio_tidy_combinations() {
        let w = windows();
        let cases = [
            ("split", AudioFormat::Mp3, tidy(true, false, false)),
            ("square", AudioFormat::Mp3, tidy(false, true, false)),
            ("normalize", AudioFormat::Mp3, tidy(false, false, true)),
            ("all_mp3", AudioFormat::Mp3, tidy(true, true, true)),
            ("all_m4a", AudioFormat::M4a, tidy(true, true, true)),
            ("all_original", AudioFormat::Best, tidy(true, true, true)),
            (
                "all_no_embeds",
                AudioFormat::Mp3,
                PostProcess {
                    embed_thumbnail: false,
                    embed_metadata: false,
                    ..tidy(true, true, true)
                },
            ),
        ];
        for (name, format, pp) in cases {
            let mut preset = audio("tidy", format, "0");
            preset.postprocess = pp;
            let args = download_args(&spec(&preset, &w, None, false, false, vec![]));
            insta::assert_yaml_snapshot!(format!("download_tidy_{name}"), args);
        }
    }

    #[test]
    fn audio_tidy_rules() {
        let flag = |a: &[String], f: &str| a.iter().filter(|x| *x == f).count();
        // Video presets ignore all three options.
        let mut v = video("best", None, VideoContainer::Mp4);
        v.postprocess = tidy(true, true, true);
        v.postprocess.sponsorblock_remove = vec!["sponsor".into()];
        let a = postprocess_args(&v);
        assert_eq!(
            a,
            [
                "--embed-thumbnail",
                "--embed-metadata",
                "--sponsorblock-remove",
                "sponsor"
            ]
        );

        // Each option needs its prerequisite.
        let mut p = audio("x", AudioFormat::Mp3, "0");
        p.postprocess = tidy(true, true, true);
        p.postprocess.sponsorblock_remove = vec!["sponsor".into()];
        let a = postprocess_args(&p);
        assert_eq!(flag(&a, "--parse-metadata"), 1);
        assert_eq!(flag(&a, "--convert-thumbnails"), 1);
        assert_eq!(flag(&a, "--ppa"), 2);
        assert!(a.contains(&SQUARE_COVER_PPA.to_string()));
        assert!(a.contains(&normalize_volume_ppa(&p.audio).unwrap()));
        assert!(a.contains(&"--sponsorblock-remove".to_string()));

        p.postprocess.embed_metadata = false;
        assert_eq!(flag(&postprocess_args(&p), "--parse-metadata"), 0);
        p.postprocess.embed_thumbnail = false;
        let a = postprocess_args(&p);
        assert_eq!(flag(&a, "--convert-thumbnails"), 0);
        assert_eq!(
            a.iter()
                .filter(|x| x.starts_with("ThumbnailsConvertor"))
                .count(),
            0
        );
        assert_eq!(flag(&a, "--ppa"), 1);

        // Original keeps the stream as is: nothing to normalize.
        p.audio.format = AudioFormat::Best;
        assert_eq!(flag(&postprocess_args(&p), "--ppa"), 0);
        for f in [AudioFormat::M4a, AudioFormat::Opus, AudioFormat::Flac] {
            p.audio.format = f;
            assert_eq!(flag(&postprocess_args(&p), "--ppa"), 1, "{f:?}");
        }

        // Off by default: nothing new for existing presets.
        let a = postprocess_args(&audio("x", AudioFormat::Mp3, "0"));
        assert_eq!(a, ["--embed-thumbnail", "--embed-metadata"]);
    }

    /// The `--ppa` values are split by yt-dlp with POSIX shlex: the crop filter must reach
    /// ffmpeg as one argument with its single quotes intact.
    #[test]
    fn square_cover_ppa_survives_shlex() {
        let (key, args) = SQUARE_COVER_PPA.split_once(':').unwrap();
        assert_eq!(key, "ThumbnailsConvertor+ffmpeg_o");
        assert_eq!(shlex_split(args), ["-vf", "crop='min(iw,ih)':'min(iw,ih)'"]);
        let ppa = normalize_volume_ppa(&audio("x", AudioFormat::Mp3, "320K").audio).unwrap();
        let (key, args) = ppa.split_once(':').unwrap();
        assert_eq!(key, "ExtractAudio");
        assert_eq!(
            shlex_split(args),
            [
                "-af",
                "loudnorm=I=-14:TP=-1.5:LRA=11",
                "-ar",
                "48000",
                "-c:a",
                "libmp3lame",
                "-b:a",
                "320k"
            ]
        );
    }

    /// Encoder and quality repeated after the filter, as yt-dlp would pass them on a re-encode
    /// (so a stream copy becomes a re-encode with the preset's quality).
    #[test]
    fn normalize_volume_mirrors_ytdlp_quality() {
        let ppa = |f: AudioFormat, q: &str| normalize_volume_ppa(&audio("x", f, q).audio);
        let tail = |f: AudioFormat, q: &str| {
            ppa(f, q)
                .unwrap()
                .strip_prefix(&format!("ExtractAudio:{NORMALIZE_VOLUME_FILTER} "))
                .unwrap()
                .to_string()
        };
        assert_eq!(ppa(AudioFormat::Best, "0"), None);
        assert_eq!(tail(AudioFormat::Mp3, "320K"), "-c:a libmp3lame -b:a 320k");
        assert_eq!(tail(AudioFormat::Mp3, "0"), "-c:a libmp3lame -q:a 0");
        assert_eq!(tail(AudioFormat::Mp3, "2"), "-c:a libmp3lame -q:a 2");
        assert_eq!(tail(AudioFormat::Mp3, ""), "-c:a libmp3lame -q:a 5");
        assert_eq!(tail(AudioFormat::M4a, "0"), "-c:a aac -q:a 4");
        assert_eq!(tail(AudioFormat::M4a, "10"), "-c:a aac -q:a 0.1");
        assert_eq!(tail(AudioFormat::M4a, "192K"), "-c:a aac -b:a 192k");
        assert_eq!(tail(AudioFormat::Opus, "0"), "-c:a libopus");
        assert_eq!(tail(AudioFormat::Opus, "128K"), "-c:a libopus -b:a 128k");
        assert_eq!(tail(AudioFormat::Flac, "0"), "-c:a flac");
    }

    /// Minimal POSIX shlex (whitespace, single and double quotes) for the test above.
    fn shlex_split(v: &str) -> Vec<String> {
        let mut out = Vec::new();
        let mut cur = String::new();
        let mut quote: Option<char> = None;
        let mut started = false;
        for c in v.chars() {
            match (quote, c) {
                (Some(q), c) if c == q => quote = None,
                (Some(_), c) => cur.push(c),
                (None, '"' | '\'') => {
                    quote = Some(c);
                    started = true;
                }
                (None, c) if c.is_whitespace() => {
                    if started {
                        out.push(std::mem::take(&mut cur));
                        started = false;
                    }
                }
                (None, c) => {
                    cur.push(c);
                    started = true;
                }
            }
        }
        if started {
            out.push(cur);
        }
        out
    }

    #[test]
    fn snapshot_probe_args() {
        let w = windows();
        let auth = vec![
            "--cookies".to_string(),
            r"C:\Users\user\cookies.txt".to_string(),
        ];
        insta::assert_yaml_snapshot!("probe_windows", probe_args(URL, &w.tools, &auth));
        insta::assert_yaml_snapshot!("probe_no_tools", probe_args(URL, &Tools::default(), &[]));
    }

    /// Invariants over the whole matrix (preset × playlist × archive × aria2c × auth × OS).
    #[test]
    fn matrix_invariants() {
        let items: &[u32] = &[2, 5];
        let auth = vec!["--cookies-from-browser".to_string(), "firefox".to_string()];
        for paths in [windows(), unix()] {
            for preset in presets() {
                for playlist in [None, Some(&[][..]), Some(items)] {
                    for archive in [false, true] {
                        for aria in [false, true] {
                            for a in [vec![], auth.clone()] {
                                let with_auth = !a.is_empty();
                                let args = download_args(&spec(
                                    &preset, &paths, playlist, archive, aria, a,
                                ));
                                let n = args.len();
                                assert_eq!(args[n - 2], "--");
                                assert_eq!(args[n - 1], URL);
                                assert_eq!(args.iter().filter(|x| *x == "--").count(), 1);
                                let has = |f: &str| args.iter().any(|x| x == f);
                                assert_eq!(has("--no-playlist"), playlist.is_none());
                                assert_eq!(has("--download-archive"), archive);
                                assert_eq!(
                                    has("--downloader"),
                                    aria && paths.tools.aria2c.is_some()
                                );
                                let o = args.iter().position(|x| x == "-o").unwrap();
                                assert_eq!(
                                    args[o + 1].starts_with(PLAYLIST_TEMPLATE_PREFIX),
                                    playlist.is_some()
                                );
                                if with_auth {
                                    let i = args
                                        .iter()
                                        .position(|x| x == "--cookies-from-browser")
                                        .unwrap();
                                    assert_eq!(args[i + 1], "firefox");
                                }
                                assert_eq!(has("-x"), preset.kind == MediaKind::Audio);
                                assert!(!args.iter().any(|x| x.is_empty()), "{args:?}");
                            }
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn limit_rate_flags() {
        let w = windows();
        let preset = video("best", None, VideoContainer::Any);
        let mut s = spec(&preset, &w, None, false, false, vec![]);
        assert!(!download_args(&s).iter().any(|x| x == "--limit-rate"));
        s.limit_rate_mbps = Some(0);
        assert!(!download_args(&s).iter().any(|x| x == "--limit-rate"));
        s.limit_rate_mbps = Some(7);
        let args = download_args(&s);
        let i = args.iter().position(|x| x == "--limit-rate").unwrap();
        assert_eq!(args[i + 1], "7M");
        assert!(!args.iter().any(|x| x.contains("max-overall")));
        s.use_aria2c = true;
        let args = download_args(&s);
        let i = args.iter().position(|x| x == "--downloader-args").unwrap();
        assert_eq!(
            args[i + 1],
            "aria2c:-x 8 -s 8 -k 1M --max-overall-download-limit=7M"
        );
        assert_eq!(aria2c_args(None), ARIA2C_ARGS);
    }

    #[test]
    fn dash_url_stays_positional() {
        let w = windows();
        let preset = video("best", None, VideoContainer::Any);
        let mut s = spec(&preset, &w, None, false, false, vec![]);
        s.url = "--exec=calc.exe";
        let args = download_args(&s);
        let n = args.len();
        assert_eq!(&args[n - 2..], ["--", "--exec=calc.exe"]);
        let probe = probe_args("-rf", &Tools::default(), &[]);
        assert_eq!(&probe[probe.len() - 2..], ["--", "-rf"]);
    }

    #[test]
    fn empty_template_falls_back() {
        let w = windows();
        let preset = video("best", None, VideoContainer::Any);
        let mut s = spec(&preset, &w, None, false, false, vec![]);
        s.filename_template = "  ";
        let args = download_args(&s);
        let o = args.iter().position(|x| x == "-o").unwrap();
        assert_eq!(args[o + 1], DEFAULT_FILENAME_TEMPLATE);
    }

    #[test]
    fn containers_and_audio_formats() {
        for (c, sort, merge) in [
            (VideoContainer::Mkv, "res", Some("mkv")),
            (VideoContainer::Webm, "res,ext:webm:webm", Some("webm")),
            (VideoContainer::Any, "res", None),
        ] {
            let a = format_args(&video("x", Some(480), c));
            assert_eq!(a[1], "bv*[height<=480]+ba/b[height<=480]");
            assert_eq!(a[3], sort);
            assert_eq!(a.get(5).map(String::as_str), merge);
        }
        for (f, name) in [
            (AudioFormat::M4a, "m4a"),
            (AudioFormat::Opus, "opus"),
            (AudioFormat::Flac, "flac"),
        ] {
            let a = format_args(&audio("x", f, "0"));
            assert_eq!(
                a,
                [
                    "-f",
                    "ba/b",
                    "-x",
                    "--audio-format",
                    name,
                    "--audio-quality",
                    "0"
                ]
            );
        }
        let a = format_args(&audio("x", AudioFormat::Mp3, " "));
        assert_eq!(a, ["-f", "ba/b", "-x", "--audio-format", "mp3"]);
        // Subtitles are never requested for audio.
        let mut p = audio("x", AudioFormat::Mp3, "0");
        p.postprocess = pp_all();
        assert!(!postprocess_args(&p).contains(&"--embed-subs".to_string()));
    }

    #[test]
    fn child_env_forces_utf8_and_prepends_helpers() {
        let env = child_env(&Tools::default());
        assert!(env.iter().any(|(k, v)| k == "PYTHONUTF8" && v == "1"));
        assert!(!env.iter().any(|(k, _)| k == "PATH"));
        let dir = std::env::temp_dir().join("ymd-ap");
        let tools = Tools {
            atomicparsley: Some(dir.join("AtomicParsley")),
            ..Tools::default()
        };
        let env = child_env(&tools);
        let path = &env.iter().find(|(k, _)| k == "PATH").unwrap().1;
        assert_eq!(std::env::split_paths(path).next().unwrap(), dir);
    }
}
