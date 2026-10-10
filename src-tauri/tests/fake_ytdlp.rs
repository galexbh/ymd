//! Keeps the fake yt-dlp honest (owner: H). Needs `--features test-support`.
#![cfg(feature = "test-support")]

use std::process::Command;

fn fake() -> Command {
    let mut c = Command::new(env!("CARGO_BIN_EXE_fake-ytdlp"));
    c.env_remove("FAKE_YTDLP_SCRIPT")
        .env_remove("FAKE_YTDLP_SCENARIO")
        .env_remove("FAKE_YTDLP_ARGV_FILE");
    c
}

#[test]
fn version_flag() {
    let out = fake()
        .arg("--version")
        .env("FAKE_YTDLP_VERSION", "2025.01.01")
        .output()
        .unwrap();
    assert!(out.status.success());
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "2025.01.01");
}

#[test]
fn success_scenario_writes_the_file_into_dash_p() {
    let dir = tempfile::tempdir().unwrap();
    let out = fake()
        .args(["--newline", "-P", dir.path().to_str().unwrap(), "https://x"])
        .output()
        .unwrap();
    assert!(out.status.success(), "{out:?}");
    let stdout = String::from_utf8_lossy(&out.stdout);
    // Real marker format: `YMD|<progress dict as JSON>` (see `ytdlp::args::PROGRESS_TEMPLATE`).
    assert!(stdout.contains("YMD|{") && stdout.contains(r#""status":"downloading""#));
    assert!(stdout.contains("YMD_FILE|"));
    assert!(dir.path().join("Fake Video [dQw4w9WgXcQ].mp4").exists());
}

#[test]
fn error_scenario_exits_non_zero_with_stderr() {
    let out = fake()
        .env("FAKE_YTDLP_SCENARIO", "error-bot")
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&out.stderr).contains("not a bot"));
}

#[test]
fn script_and_argv_recording() {
    let dir = tempfile::tempdir().unwrap();
    let script = dir.path().join("script.txt");
    let argv_file = dir.path().join("argv.jsonl");
    std::fs::write(
        &script,
        "# comment\nout hello {arg:-o}\nerr warn {env:FAKE_X}\ntouch {arg:-P}/a/b.txt\nexit 3\nout unreachable\n",
    )
    .unwrap();
    let p = dir.path().to_str().unwrap();
    let out = fake()
        .env("FAKE_YTDLP_SCRIPT", &script)
        .env("FAKE_YTDLP_ARGV_FILE", &argv_file)
        .env("FAKE_X", "42")
        .args(["-o", "%(title)s.%(ext)s", "-P", p, "--", "https://a b"])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(3));
    assert_eq!(
        String::from_utf8_lossy(&out.stdout).trim(),
        "hello %(title)s.%(ext)s"
    );
    assert_eq!(String::from_utf8_lossy(&out.stderr).trim(), "warn 42");
    assert!(dir.path().join("a").join("b.txt").exists());
    let argv: Vec<String> =
        serde_json::from_str(std::fs::read_to_string(&argv_file).unwrap().trim()).unwrap();
    assert_eq!(
        argv,
        ["-o", "%(title)s.%(ext)s", "-P", p, "--", "https://a b"]
    );
}

#[test]
fn probe_scenarios_print_valid_json() {
    for (scenario, kind) in [("probe-video", "video"), ("probe-playlist", "playlist")] {
        let out = fake()
            .env("FAKE_YTDLP_SCENARIO", scenario)
            .arg("-J")
            .output()
            .unwrap();
        let v: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
        assert_eq!(v["_type"], kind);
    }
}

#[test]
fn playlist_scenario_reports_items() {
    let dir = tempfile::tempdir().unwrap();
    let out = fake()
        .env("FAKE_YTDLP_SCENARIO", "playlist")
        .args(["-P", dir.path().to_str().unwrap()])
        .output()
        .unwrap();
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("Downloading item 3 of 3"));
    assert_eq!(stdout.matches("YMD_FILE|").count(), 3);
}

#[test]
fn unknown_scenario_fails() {
    let out = fake().env("FAKE_YTDLP_SCENARIO", "nope").output().unwrap();
    assert_eq!(out.status.code(), Some(2));
}
