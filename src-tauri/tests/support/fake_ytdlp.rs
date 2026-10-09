//! Test stand-in for yt-dlp (built with `--features test-support`). Owner: B.
//!
//! It parses the argv ymd builds (`-P home:/temp:`, `-o`, `--print`, `--progress-template`, `-x`,
//! `--audio-format`, `--merge-output-format`, `--playlist-items`, `-J`, `-- <url>`), renders the
//! requested marker templates with a small subset of yt-dlp's output-template syntax, and writes a
//! real file into the `home:` path so `filepath` exists.
//!
//! The scenario comes from `FAKE_YTDLP_SCENARIO`, or else from the URL (`fake://<scenario>[/<arg>]`)
//! so tests running in parallel can each pick their own:
//! - `success` (default): one item; video (merge) or audio (`-x`) depending on argv;
//! - `playlist`: three items (or the `--playlist-items` given);
//! - `slow[/<ms>]`: like `success` with 20 steps of 100 ms (or `<ms>`) each;
//! - `error/<fixture>`: prints `tests/fixtures/stderr/<fixture>.txt` to stderr, exits 1;
//! - `hang`: starts downloading, spawns a grandchild (`sleep`), writes `<temp>/pids.txt`
//!   ("<own pid> <grandchild pid>") and a `.part` file, then never exits;
//! - `sleep`: never exits;
//! - with `-J`: prints `probe_video.json` (or `probe_playlist.json` for scenario `playlist`).
//!
//! `FAKE_YTDLP_DELAY_MS` overrides the per-step delay; `FAKE_YTDLP_ARGV` (a file path) receives
//! the argv as JSON lines for assertions.

use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

const PROBE_VIDEO: &str = include_str!("../fixtures/ytdlp/probe_video.json");
const PROBE_PLAYLIST: &str = include_str!("../fixtures/ytdlp/probe_playlist.json");

/// Options that take a value (so their value is not mistaken for the URL).
const WITH_VALUE: &[&str] = &[
    "-P",
    "--paths",
    "-o",
    "--output",
    "--print",
    "-O",
    "--progress-template",
    "--audio-format",
    "--audio-quality",
    "--merge-output-format",
    "--playlist-items",
    "-I",
    "--color",
    "--encoding",
    "-N",
    "--concurrent-fragments",
    "--ffmpeg-location",
    "--js-runtimes",
    "--download-archive",
    "--downloader",
    "--external-downloader",
    "--downloader-args",
    "-f",
    "--format",
    "-S",
    "--format-sort",
    "--sub-langs",
    "--sponsorblock-remove",
    "--cookies-from-browser",
    "--cookies",
    "--video-password",
    "-2",
    "--twofactor",
    "--netrc-cmd",
    "-u",
    "--username",
    "-p",
    "--password",
];

#[derive(Default, Debug)]
struct Args {
    home: Option<PathBuf>,
    temp: Option<PathBuf>,
    output: Option<String>,
    prints: Vec<(String, String)>,
    progress: Vec<(String, String)>,
    json: bool,
    extract_audio: bool,
    audio_format: Option<String>,
    merge_format: Option<String>,
    playlist_items: Option<Vec<u32>>,
    url: Option<String>,
}

fn parse_args(argv: &[String]) -> Args {
    let mut a = Args::default();
    let mut i = 0;
    while i < argv.len() {
        let arg = argv[i].as_str();
        if arg == "--" {
            a.url = argv.get(i + 1).cloned();
            break;
        }
        let value = || argv.get(i + 1).cloned().unwrap_or_default();
        match arg {
            "-J" | "--dump-single-json" => a.json = true,
            "-x" | "--extract-audio" => a.extract_audio = true,
            "-P" | "--paths" => {
                let v = value();
                if let Some(p) = v.strip_prefix("home:") {
                    a.home = Some(p.into());
                } else if let Some(p) = v.strip_prefix("temp:") {
                    a.temp = Some(p.into());
                } else {
                    a.home = Some(v.into());
                }
            }
            "-o" | "--output" => a.output = Some(value()),
            "--print" | "-O" => a.prints.push(split_when(&value(), "video")),
            "--progress-template" => a.progress.push(split_when(&value(), "download")),
            "--audio-format" => a.audio_format = Some(value()),
            "--merge-output-format" => a.merge_format = Some(value()),
            "--playlist-items" | "-I" => {
                a.playlist_items = Some(value().split(',').filter_map(|s| s.parse().ok()).collect())
            }
            _ => {}
        }
        if WITH_VALUE.contains(&arg) {
            i += 2;
        } else {
            if !arg.starts_with('-') && a.url.is_none() {
                a.url = Some(arg.to_string());
            }
            i += 1;
        }
    }
    a
}

/// `when:template` → (when, template), when `when` is a known stage/type.
fn split_when(v: &str, default: &str) -> (String, String) {
    const KNOWN: &[&str] = &[
        "pre_process",
        "after_filter",
        "video",
        "before_dl",
        "post_process",
        "after_move",
        "after_video",
        "playlist",
        "download",
        "download-title",
        "postprocess",
        "postprocess-title",
    ];
    match v.split_once(':') {
        Some((w, t)) if KNOWN.contains(&w) => (w.to_string(), t.to_string()),
        _ => (default.to_string(), v.to_string()),
    }
}

/// Minimal output-template renderer: `%(a,b|default)s`, `%(x.y)s`, `%(x)j`, `%(n)03d`.
fn render(tmpl: &str, fields: &HashMap<&str, String>) -> String {
    let mut out = String::new();
    let mut rest = tmpl;
    while let Some(start) = rest.find("%(") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        let Some(close) = after.find(')') else {
            out.push_str(&rest[start..]);
            return out;
        };
        let key = &after[..close];
        let spec_and_more = &after[close + 1..];
        let conv_len = spec_and_more
            .find(|c: char| c.is_ascii_alphabetic())
            .map(|n| n + 1)
            .unwrap_or(0);
        let (names, default) = match key.split_once('|') {
            Some((n, d)) => (n, Some(d)),
            None => (key, None),
        };
        let value = names
            .split(',')
            .find_map(|n| fields.get(n.trim()).cloned())
            .or_else(|| default.map(str::to_string))
            .unwrap_or_else(|| "NA".to_string());
        out.push_str(&value);
        rest = &spec_and_more[conv_len..];
    }
    out.push_str(rest);
    out
}

fn say(line: &str) {
    let mut o = std::io::stdout().lock();
    let _ = writeln!(o, "{line}");
    let _ = o.flush();
}

fn say_err(line: &str) {
    let mut e = std::io::stderr().lock();
    let _ = writeln!(e, "{line}");
    let _ = e.flush();
}

fn sleep_forever() -> ! {
    loop {
        std::thread::sleep(Duration::from_secs(60));
    }
}

struct Item {
    index: u32,
    autonumber: u32,
    count: u32,
    title: String,
    id: String,
}

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    if let Ok(path) = std::env::var("FAKE_YTDLP_ARGV") {
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(f, "{}", serde_json::to_string(&argv).unwrap_or_default());
        }
    }
    let args = parse_args(&argv);
    let url = args.url.clone().unwrap_or_default();
    let scenario = std::env::var("FAKE_YTDLP_SCENARIO")
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| url.strip_prefix("fake://").map(str::to_string))
        .unwrap_or_else(|| "success".to_string());
    let (name, arg) = match scenario.split_once('/') {
        Some((n, a)) => (n.to_string(), a.to_string()),
        None => (scenario.clone(), String::new()),
    };

    match name.as_str() {
        "sleep" => sleep_forever(),
        "error" => {
            let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures/stderr")
                .join(format!("{arg}.txt"));
            let text = std::fs::read_to_string(&fixture)
                .unwrap_or_else(|_| format!("ERROR: fake-ytdlp: unknown fixture {arg}\n"));
            say_err("WARNING: fake-ytdlp is about to fail");
            for line in text.lines() {
                say_err(line);
            }
            std::process::exit(1);
        }
        _ => {}
    }

    if args.json {
        say(if name == "playlist" {
            PROBE_PLAYLIST.trim()
        } else {
            PROBE_VIDEO.trim()
        });
        return;
    }

    let delay = std::env::var("FAKE_YTDLP_DELAY_MS")
        .ok()
        .or_else(|| (name == "slow").then(|| arg.clone()))
        .and_then(|v| v.parse().ok())
        .unwrap_or(if name == "slow" { 100 } else { 5 });
    let steps = if name == "slow" { 20 } else { 5 };

    let items: Vec<Item> = if name == "playlist" {
        let indices = args
            .playlist_items
            .clone()
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| vec![1, 2, 3]);
        let count = indices.len() as u32;
        indices
            .into_iter()
            .enumerate()
            .map(|(i, index)| Item {
                index,
                autonumber: i as u32 + 1,
                count,
                title: format!("Fake Item {index}"),
                id: format!("fakeid{index:05}"),
            })
            .collect()
    } else {
        vec![Item {
            index: 0,
            autonumber: 0,
            count: 0,
            title: "Fake Video".into(),
            id: "fakeid00000".into(),
        }]
    };

    let home = args.home.clone().unwrap_or_else(|| PathBuf::from("."));
    let temp = args.temp.clone().unwrap_or_else(|| home.clone());
    let _ = std::fs::create_dir_all(&temp);
    let ext = if args.extract_audio {
        args.audio_format.clone().unwrap_or_else(|| "opus".into())
    } else {
        args.merge_format.clone().unwrap_or_else(|| "mkv".into())
    };
    let streams: &[&str] = if args.extract_audio { &["audio"] } else { &["video", "audio"] };
    let pps: &[&str] = if args.extract_audio {
        &["ExtractAudio", "MoveFiles"]
    } else {
        &["Merger", "MoveFiles"]
    };

    for item in &items {
        let mut fields: HashMap<&str, String> = HashMap::new();
        fields.insert("title", item.title.clone());
        fields.insert("id", item.id.clone());
        fields.insert("ext", ext.clone());
        if item.count > 0 {
            fields.insert("playlist", "Fake Playlist".into());
            fields.insert("playlist_title", "Fake Playlist".into());
            fields.insert("playlist_id", "PLfake".into());
            fields.insert("playlist_index", format!("{:02}", item.index));
            fields.insert("playlist_autonumber", item.autonumber.to_string());
            fields.insert("n_entries", item.count.to_string());
        }
        for (when, t) in &args.prints {
            if when == "before_dl" {
                say(&render(t, &fields));
            }
        }

        let total: u64 = 1_000_000;
        for (s_i, stream) in streams.iter().enumerate() {
            let part = temp.join(format!("{}.f{s_i}.{stream}.part", item.id));
            let _ = std::fs::write(&part, b"partial");
            for step in 1..=steps {
                let done = total * step / steps;
                let finished = step == steps;
                let status = if finished { "finished" } else { "downloading" };
                let speed = (!finished).then_some(250_000.0);
                let progress = serde_json::json!({
                    "status": status,
                    "downloaded_bytes": done,
                    "total_bytes": total,
                    "speed": speed,
                    "eta": (total - done) / 250_000,
                    "tmpfilename": part.to_string_lossy(),
                    "_percent_str": format!("{:5.1}%", done as f64 * 100.0 / total as f64),
                });
                let mut pf = fields.clone();
                pf.insert("progress", progress.to_string());
                for (when, t) in &args.progress {
                    if when == "download" {
                        say(&render(t, &pf));
                    }
                }
                if name == "hang" && s_i == 0 && step == 1 {
                    let child = std::process::Command::new(std::env::current_exe().unwrap())
                        .env("FAKE_YTDLP_SCENARIO", "sleep")
                        .stdin(std::process::Stdio::null())
                        .stdout(std::process::Stdio::null())
                        .stderr(std::process::Stdio::null())
                        .spawn()
                        .expect("spawn grandchild");
                    let _ = std::fs::write(
                        temp.join("pids.txt"),
                        format!("{} {}", std::process::id(), child.id()),
                    );
                    sleep_forever();
                }
                std::thread::sleep(Duration::from_millis(delay));
            }
            let _ = std::fs::remove_file(&part);
        }

        for pp in pps {
            for status in ["started", "finished"] {
                let mut pf = fields.clone();
                pf.insert("progress.status", status.into());
                pf.insert("progress.postprocessor", pp.to_string());
                for (when, t) in &args.progress {
                    if when == "postprocess" {
                        say_err(&render(t, &pf));
                    }
                }
            }
        }

        let template = args
            .output
            .clone()
            .unwrap_or_else(|| "%(title)s [%(id)s].%(ext)s".into());
        let rel = render(&template, &fields);
        let mut path = home.clone();
        for part in rel.split(['/', '\\']).filter(|p| !p.is_empty()) {
            path.push(part);
        }
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(&path, format!("fake media for {}\n", item.id)).expect("write output");
        fields.insert("filepath", path.to_string_lossy().into_owned());
        for (when, t) in &args.prints {
            if when == "after_move" {
                say(&render(t, &fields));
            }
        }
    }
}
