//! Test stand-in for yt-dlp. Owners: test-infra (H, script mode) and jobs (B, built-in scenarios).
//! Built only with `--features test-support`; integration tests get its path from
//! `env!("CARGO_BIN_EXE_fake-ytdlp")`. Never bundled.
//!
//! Behaviour (all optional, via env vars):
//! - `FAKE_YTDLP_ARGV_FILE`: append this invocation's argv as one JSON array per line, so tests can
//!   assert exactly what ymd passed (argv only, never a shell).
//! - `FAKE_YTDLP_VERSION`: what `--version` prints (default `2026.10.07`).
//! - `FAKE_YTDLP_SCRIPT`: path to a script; one directive per line (blank lines / `#` ignored):
//!   `out <text>`   print a line on stdout        `err <text>`   print a line on stderr
//!   `sleep <ms>`   wait                          `hang`         sleep forever (cancel tests)
//!   `touch <path>` create a file (+ parents)     `exit <code>`  stop with that exit code
//!   `cat <path>`   copy a file to stdout (e.g. a recorded `-J` JSON fixture)
//!   Text and paths expand `{arg:-o}` / `{arg:-P}` (value after that flag; `-P` defaults to
//!   `.`), `{cwd}`, `{pid}` and `{env:NAME}`.
//! - Otherwise a built-in scenario, from `FAKE_YTDLP_SCENARIO` or else from the URL
//!   (`fake://<scenario>[/<arg>]`, so tests running in parallel can each pick their own):
//!   - `success` (default): one item; video (merge) or audio (`-x`) depending on argv;
//!   - `playlist`: three items (or the `--playlist-items` given);
//!   - `slow[/<ms>]`: like `success` with 20 steps of 100 ms (or `<ms>`) each;
//!   - `error/<fixture>`: prints `tests/fixtures/stderr/<fixture>.txt` to stderr, exits 1
//!     (`error-bot`, `error-private`, `error-ffmpeg` are aliases);
//!   - `hang`: starts downloading, spawns a grandchild (`sleep`), writes `<temp>/pids.txt`
//!     ("<own pid> <grandchild pid>") and a `.part` file, then never exits;
//!   - `sleep`: never exits;
//!   - `probe-video` / `probe-playlist`, or any scenario with `-J`: prints the recorded real
//!     `-J` fixture (`playlist` scenarios print the playlist one).
//!
//! Built-in scenarios behave like the real yt-dlp for the argv ymd builds (`ytdlp::args`): they
//! parse `-P home:/temp:`, `-o`, `--print`, `--progress-template`, `-x`, `--audio-format`,
//! `--merge-output-format`, `--playlist-items` and `-- <url>`, render the requested marker
//! templates (`YMD|{json}`, `YMD_META|`, `YMD_ITEM|`, `YMD_FILE|` on stdout; `YMD_PP|` on stderr)
//! with a subset of yt-dlp's output-template syntax, and write a real file under `home:`. When
//! the argv carries no templates, ymd's default ones are used and the plain
//! `[download] Downloading item N of M` lines are printed too (non-quiet mode).
//! `FAKE_YTDLP_DELAY_MS` overrides the per-step delay.

use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();

    if let Some(file) = std::env::var_os("FAKE_YTDLP_ARGV_FILE") {
        let line = serde_json::to_string(&argv).expect("argv is serialisable");
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(file)
            .expect("open FAKE_YTDLP_ARGV_FILE");
        writeln!(f, "{line}").expect("write argv");
    }

    // Like yt-dlp, rewrite the `--cookies` jar (here: append a line), so tests can tell which
    // file was handed over. A missing jar is an error, as in yt-dlp.
    if let Some(jar) = argv
        .iter()
        .position(|a| a == "--cookies")
        .and_then(|i| argv.get(i + 1))
    {
        let mut f = match std::fs::OpenOptions::new().append(true).open(jar) {
            Ok(f) => f,
            Err(e) => {
                eprintln!("ERROR: cannot open cookies file {jar}: {e}");
                std::process::exit(1);
            }
        };
        writeln!(f, "# rewritten by fake-ytdlp").expect("write jar");
    }

    if argv.iter().any(|a| a == "--version") {
        let v = std::env::var("FAKE_YTDLP_VERSION").unwrap_or_else(|_| "2026.10.07".into());
        println!("{v}");
        return;
    }

    if let Some(path) = std::env::var_os("FAKE_YTDLP_SCRIPT") {
        let script = std::fs::read_to_string(&path)
            .unwrap_or_else(|e| panic!("read FAKE_YTDLP_SCRIPT {path:?}: {e}"));
        std::process::exit(run(&script, &argv));
    }

    std::process::exit(scenario(&argv));
}

// ───────────────────────────── Script mode (H) ─────────────────────────────

/// Executes a script; returns the exit code.
fn run(script: &str, argv: &[String]) -> i32 {
    let stdout = std::io::stdout();
    let stderr = std::io::stderr();
    for raw in script.lines() {
        let line = raw.trim_end();
        if line.trim().is_empty() || line.trim_start().starts_with('#') {
            continue;
        }
        let (cmd, rest) = line.split_once(' ').unwrap_or((line, ""));
        let rest = expand(rest, argv);
        match cmd {
            "out" => {
                let mut o = stdout.lock();
                let _ = writeln!(o, "{rest}");
                let _ = o.flush();
            }
            "err" => {
                let mut e = stderr.lock();
                let _ = writeln!(e, "{rest}");
                let _ = e.flush();
            }
            "sleep" => std::thread::sleep(Duration::from_millis(rest.trim().parse().unwrap_or(0))),
            "hang" => sleep_forever(),
            "touch" => {
                let p = PathBuf::from(rest.trim());
                if let Some(dir) = p.parent() {
                    let _ = std::fs::create_dir_all(dir);
                }
                std::fs::write(&p, b"fake media").unwrap_or_else(|e| panic!("touch {p:?}: {e}"));
            }
            "cat" => {
                let body = std::fs::read_to_string(rest.trim())
                    .unwrap_or_else(|e| panic!("cat {rest:?}: {e}"));
                let mut o = stdout.lock();
                let _ = o.write_all(body.as_bytes());
                let _ = o.flush();
            }
            "exit" => return rest.trim().parse().unwrap_or(1),
            other => panic!("fake-ytdlp: unknown directive {other:?}"),
        }
    }
    0
}

/// Value following `flag` in argv (`-o x` or `-o=x`).
fn arg_value<'a>(argv: &'a [String], flag: &str) -> Option<&'a str> {
    let eq = format!("{flag}=");
    argv.iter().enumerate().find_map(|(i, a)| {
        if a == flag {
            argv.get(i + 1).map(String::as_str)
        } else {
            a.strip_prefix(&eq)
        }
    })
}

fn expand(s: &str, argv: &[String]) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(start) = rest.find('{') {
        out.push_str(&rest[..start]);
        let Some(end) = rest[start..].find('}') else {
            out.push_str(&rest[start..]);
            return out;
        };
        let key = &rest[start + 1..start + end];
        let value = if let Some(flag) = key.strip_prefix("arg:") {
            // `-P` defaults to the working directory, like yt-dlp's own default.
            let fallback = if flag == "-P" { "." } else { "" };
            arg_value(argv, flag).unwrap_or(fallback).to_string()
        } else if let Some(name) = key.strip_prefix("env:") {
            std::env::var(name).unwrap_or_default()
        } else if key == "cwd" {
            std::env::current_dir()
                .map(|p| p.display().to_string())
                .unwrap_or_default()
        } else if key == "pid" {
            std::process::id().to_string()
        } else {
            format!("{{{key}}}")
        };
        out.push_str(&value);
        rest = &rest[start + end + 1..];
    }
    out.push_str(rest);
    out
}

// ───────────────────────────── Built-in scenarios (B) ─────────────────────────────

const PROBE_VIDEO: &str = include_str!("../fixtures/ytdlp/probe_video.json");
const PROBE_PLAYLIST: &str = include_str!("../fixtures/ytdlp/probe_playlist.json");

/// Same templates `ytdlp::args::download_args` passes (used when the argv has none).
const DEFAULT_PRINTS: &[(&str, &str)] = &[
    ("before_dl", "YMD_META|%(title)s"),
    (
        "before_dl",
        "YMD_ITEM|%(playlist_autonumber)s|%(n_entries)s",
    ),
    ("after_move", "YMD_FILE|%(filepath)s"),
];
const DEFAULT_PROGRESS: &[(&str, &str)] = &[
    ("download", "YMD|%(progress)j"),
    (
        "postprocess",
        "YMD_PP|%(progress.status)s|%(progress.postprocessor)s",
    ),
];

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
        std::thread::sleep(Duration::from_secs(3600));
    }
}

struct Item {
    index: u32,
    autonumber: u32,
    count: u32,
    title: String,
    id: String,
}

fn owned(list: &[(&str, &str)]) -> Vec<(String, String)> {
    list.iter()
        .map(|(w, t)| (w.to_string(), t.to_string()))
        .collect()
}

/// Runs a built-in scenario; returns the exit code.
fn scenario(argv: &[String]) -> i32 {
    let mut args = parse_args(argv);
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
    let (name, arg) = match name.as_str() {
        "error-bot" => ("error".to_string(), "bot_check".to_string()),
        "error-private" => ("error".to_string(), "private".to_string()),
        "error-ffmpeg" => ("error".to_string(), "ffmpeg_missing".to_string()),
        _ => (name, arg),
    };

    match name.as_str() {
        "success" | "playlist" | "slow" | "hang" => {}
        "sleep" => sleep_forever(),
        "probe-video" => {
            say(PROBE_VIDEO.trim());
            return 0;
        }
        "probe-playlist" => {
            say(PROBE_PLAYLIST.trim());
            return 0;
        }
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
            return 1;
        }
        other => {
            say_err(&format!("fake-ytdlp: unknown scenario {other:?}"));
            return 2;
        }
    }

    if args.json {
        say(if name == "playlist" {
            PROBE_PLAYLIST.trim()
        } else {
            PROBE_VIDEO.trim()
        });
        return 0;
    }

    // No templates in argv: behave like yt-dlp would for ymd's defaults, and like non-quiet mode.
    let quiet = !args.prints.is_empty();
    if args.prints.is_empty() {
        args.prints = owned(DEFAULT_PRINTS);
    }
    if args.progress.is_empty() {
        args.progress = owned(DEFAULT_PROGRESS);
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
            id: "dQw4w9WgXcQ".into(),
        }]
    };

    let home = args.home.clone().unwrap_or_else(|| PathBuf::from("."));
    let temp = args.temp.clone().unwrap_or_else(|| home.clone());
    let _ = std::fs::create_dir_all(&temp);
    let ext = if args.extract_audio {
        args.audio_format.clone().unwrap_or_else(|| "opus".into())
    } else {
        args.merge_format.clone().unwrap_or_else(|| "mp4".into())
    };
    let streams: &[&str] = if args.extract_audio {
        &["audio"]
    } else {
        &["video", "audio"]
    };
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
            if !quiet {
                say(&format!(
                    "[download] Downloading item {} of {}",
                    item.autonumber, item.count
                ));
            }
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
                    // Deliberately never waited: it stands in for ffmpeg/aria2c and must be
                    // taken down by ymd's process-tree kill, not by us.
                    #[allow(clippy::zombie_processes)]
                    let child = std::process::Command::new(std::env::current_exe().unwrap())
                        .env("FAKE_YTDLP_SCENARIO", "sleep")
                        .env_remove("FAKE_YTDLP_SCRIPT")
                        .env_remove("FAKE_YTDLP_ARGV_FILE")
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
    0
}
