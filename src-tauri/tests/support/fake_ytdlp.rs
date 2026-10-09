//! Test stand-in for yt-dlp. Owner: test-infra agent (H). Built only with `--features test-support`;
//! integration tests get its path from `env!("CARGO_BIN_EXE_fake-ytdlp")`. Never bundled.
//!
//! Behaviour (all optional, via env vars):
//! - `FAKE_YTDLP_ARGV_FILE`: append this invocation's argv as one JSON array per line, so tests can
//!   assert exactly what ymd passed (argv only, never a shell).
//! - `FAKE_YTDLP_VERSION`: what `--version` prints (default `2026.10.07`).
//! - `FAKE_YTDLP_SCRIPT`: path to a script; one directive per line (blank lines / `#` ignored):
//!     `out <text>`   print a line on stdout        `err <text>`   print a line on stderr
//!     `sleep <ms>`   wait                          `hang`         sleep forever (cancel tests)
//!     `touch <path>` create a file (+ parents)     `exit <code>`  stop with that exit code
//!     `cat <path>`   copy a file to stdout (e.g. a recorded `-J` JSON fixture)
//!   Text and paths expand `{arg:-o}` / `{arg:-P}` (value after that flag; `-P` defaults to
//!   `.`), `{cwd}`, `{pid}`
//!   and `{env:NAME}`.
//! - `FAKE_YTDLP_SCENARIO`: a built-in script when no script file is given:
//!   `success` (default), `playlist`, `error-bot`, `error-private`, `error-ffmpeg`, `hang`,
//!   `probe-video`, `probe-playlist`. Progress lines use ymd's markers (`YMD|`, `YMD_FILE|`,
//!   `YMD_META|`, see `ytdlp::args`) with `|`-separated fields
//!   `stage|downloaded|total|speed|eta`; if the job agent settles on another template, prefer a
//!   script fixture over changing these built-ins.

use std::io::Write;
use std::path::PathBuf;
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

    if argv.iter().any(|a| a == "--version") {
        let v = std::env::var("FAKE_YTDLP_VERSION").unwrap_or_else(|_| "2026.10.07".into());
        println!("{v}");
        return;
    }

    let script = match std::env::var_os("FAKE_YTDLP_SCRIPT") {
        Some(path) => std::fs::read_to_string(&path)
            .unwrap_or_else(|e| panic!("read FAKE_YTDLP_SCRIPT {path:?}: {e}")),
        None => {
            let scenario =
                std::env::var("FAKE_YTDLP_SCENARIO").unwrap_or_else(|_| "success".into());
            builtin(&scenario).unwrap_or_else(|| {
                eprintln!("fake-ytdlp: unknown scenario {scenario:?}");
                std::process::exit(2);
            })
        }
    };

    std::process::exit(run(&script, &argv));
}

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
            "hang" => loop {
                std::thread::sleep(Duration::from_secs(3600));
            },
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

const PROBE_VIDEO: &str = r#"{"_type":"video","id":"dQw4w9WgXcQ","title":"Fake Video","uploader":"ymd tests","duration":212,"thumbnail":"https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg","extractor_key":"Youtube","webpage_url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","formats":[{"format_id":"140","ext":"m4a","vcodec":"none","acodec":"mp4a.40.2","abr":129.5,"filesize":3433514,"format_note":"medium"},{"format_id":"137","ext":"mp4","height":1080,"fps":30,"vcodec":"avc1.640028","acodec":"none","filesize":80000000,"format_note":"1080p"}]}"#;

const PROBE_PLAYLIST: &str = r#"{"_type":"playlist","id":"PLfake","title":"Fake Playlist","uploader":"ymd tests","extractor_key":"YoutubeTab","webpage_url":"https://www.youtube.com/playlist?list=PLfake","entries":[{"_type":"url","id":"aaaaaaaaaaa","title":"One","duration":61,"url":"https://www.youtube.com/watch?v=aaaaaaaaaaa"},{"_type":"url","id":"bbbbbbbbbbb","title":"Two","duration":62,"url":"https://www.youtube.com/watch?v=bbbbbbbbbbb"},{"_type":"url","id":"ccccccccccc","title":"Three","duration":63,"url":"https://www.youtube.com/watch?v=ccccccccccc"}]}"#;

fn builtin(name: &str) -> Option<String> {
    let s = match name {
        "success" => "\
out [youtube] Extracting URL: https://www.youtube.com/watch?v=dQw4w9WgXcQ
out YMD_META|dQw4w9WgXcQ|Fake Video
out YMD|downloading|1048576|10485760|2097152.0|4
sleep 50
out YMD|downloading|5242880|10485760|2097152.0|2
sleep 50
out YMD|downloading|10485760|10485760|2097152.0|0
out [Merger] Merging formats into \"{arg:-P}/Fake Video [dQw4w9WgXcQ].mp4\"
touch {arg:-P}/Fake Video [dQw4w9WgXcQ].mp4
out YMD_FILE|{arg:-P}/Fake Video [dQw4w9WgXcQ].mp4
"
        .to_string(),
        "playlist" => {
            let mut s = String::new();
            for (i, (id, title)) in [("aaaaaaaaaaa", "One"), ("bbbbbbbbbbb", "Two"), ("ccccccccccc", "Three")]
                .iter()
                .enumerate()
            {
                s += &format!(
                    "out [download] Downloading item {} of 3\nout YMD_META|{id}|{title}\n\
                     out YMD|downloading|500|1000|1000.0|0\nsleep 20\n\
                     out YMD|downloading|1000|1000|1000.0|0\n\
                     touch {{arg:-P}}/{title} [{id}].mp3\nout YMD_FILE|{{arg:-P}}/{title} [{id}].mp3\n",
                    i + 1
                );
            }
            s
        }
        "error-bot" => "\
err ERROR: [youtube] dQw4w9WgXcQ: Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for the authentication. See  https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp  for how to manually pass cookies. Also see  https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies  for tips on effectively exporting YouTube cookies
exit 1
"
        .to_string(),
        "error-private" => "\
err ERROR: [youtube] dQw4w9WgXcQ: Private video. Sign in if you've been granted access to this video. Use --cookies-from-browser or --cookies for the authentication.
exit 1
"
        .to_string(),
        "error-ffmpeg" => "\
out YMD|downloading|1000|1000|1000.0|0
err ERROR: You have requested merging of multiple formats but ffmpeg is not installed. Aborting due to --abort-on-error
exit 1
"
        .to_string(),
        "hang" => "\
out YMD_META|dQw4w9WgXcQ|Fake Video
out YMD|downloading|1024|10485760|1024.0|9999
touch {arg:-P}/Fake Video [dQw4w9WgXcQ].mp4.part
hang
"
        .to_string(),
        "probe-video" => format!("out {PROBE_VIDEO}\n"),
        "probe-playlist" => format!("out {PROBE_PLAYLIST}\n"),
        _ => return None,
    };
    Some(s)
}
