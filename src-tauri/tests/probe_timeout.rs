//! A probe that times out takes yt-dlp down before it returns. Own test binary: it sets
//! `FAKE_YTDLP_SCRIPT` for the whole process.
#![cfg(feature = "test-support")]

use std::time::{Duration, Instant};
use ymd_lib::deps::Tools;
use ymd_lib::model::{ErrorCode, NetworkSettings};
use ymd_lib::ytdlp::probe;

const FAKE: &str = env!("CARGO_BIN_EXE_fake-ytdlp");

fn is_alive(pid: u32) -> bool {
    #[cfg(windows)]
    {
        let out = std::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/NH", "/FO", "CSV"])
            .output()
            .expect("tasklist");
        String::from_utf8_lossy(&out.stdout).contains(&format!("\"{pid}\""))
    }
    #[cfg(unix)]
    {
        std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn timed_out_probe_kills_ytdlp() {
    let dir = tempfile::tempdir().unwrap();
    let script = dir.path().join("hang.txt");
    let marker = dir.path().join("pid");
    std::fs::write(
        &script,
        format!("touch {}-{{pid}}\nhang\n", marker.to_string_lossy()),
    )
    .unwrap();
    std::env::set_var("FAKE_YTDLP_SCRIPT", &script);
    let tools = Tools {
        ytdlp: Some(FAKE.into()),
        ..Tools::default()
    };

    let started = Instant::now();
    let err = probe::probe_with_timeout(
        "https://example.com/v",
        &tools,
        &NetworkSettings::default(),
        &[],
        Duration::from_millis(1500),
    )
    .await
    .unwrap_err();
    assert_eq!(err.code, ErrorCode::Network);
    assert!(started.elapsed() < Duration::from_secs(20));

    let pid: u32 = std::fs::read_dir(dir.path())
        .unwrap()
        .filter_map(|e| {
            e.unwrap()
                .file_name()
                .to_string_lossy()
                .strip_prefix("pid-")
                .and_then(|p| p.parse().ok())
        })
        .next()
        .expect("the fake started");
    let deadline = Instant::now() + Duration::from_secs(10);
    while is_alive(pid) {
        assert!(Instant::now() < deadline, "yt-dlp {pid} still running");
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}
