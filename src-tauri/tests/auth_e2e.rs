//! Manual end-to-end checks against a real yt-dlp (network, real keychain, real browsers).
//! Run with: `YMD_TEST_YTDLP=/path/to/yt-dlp cargo test --features test-support --test auth_e2e -- --ignored --nocapture`
//! Optional: `YMD_TEST_BROWSER=brave[:Profile]` for the snapshot check.

use std::path::{Path, PathBuf};
use ymd_lib::auth::keychain::{OsKeychain, SecretStore};
use ymd_lib::auth::{cookies, netrc};
use ymd_lib::deps::Tools;
use ymd_lib::model::{Browser, ErrorCode};
use ymd_lib::paths::AppPaths;

fn ytdlp() -> Option<PathBuf> {
    std::env::var_os("YMD_TEST_YTDLP").map(PathBuf::from)
}

fn paths(root: &Path) -> AppPaths {
    AppPaths {
        bin_dir: root.join("bin"),
        data_dir: root.join("data"),
        config_dir: root.join("config"),
    }
}

/// Copies the real `ymd` binary into a directory with spaces and lets yt-dlp call it through
/// `--netrc-cmd`. A throwaway `vimeo` account is stored in the OS keychain for the duration
/// (skipped if a real one exists). Login itself fails (fake account); we only assert yt-dlp
/// ran the helper and parsed its line.
#[test]
#[ignore = "needs YMD_TEST_YTDLP, network and an OS keychain"]
fn ytdlp_reads_netrc_helper_output() {
    let Some(ytdlp) = ytdlp() else { return };
    let dir = tempfile::tempdir().unwrap();
    let bin_dir = dir.path().join("Program Files").join("ymd app");
    std::fs::create_dir_all(&bin_dir).unwrap();
    let helper = bin_dir.join(if cfg!(windows) {
        "ymd app.exe"
    } else {
        "ymd app"
    });
    std::fs::copy(env!("CARGO_BIN_EXE_ymd"), &helper).unwrap();

    let store = OsKeychain {
        index_file: dir.path().join("accounts.json"),
    };
    if store.get("vimeo").unwrap().is_some() {
        eprintln!("a real vimeo account exists; not touching it");
        return;
    }
    store
        .set("vimeo", "ymd-fake-user", "fake-Pass_123!")
        .unwrap();
    let out = std::process::Command::new(&ytdlp)
        .args(["--ignore-config", "-v", "--simulate", "--netrc-cmd"])
        .arg(netrc::netrc_cmd(&helper))
        .arg("https://vimeo.com/76979871")
        .output()
        .unwrap();
    store.delete("vimeo").unwrap();
    let log =
        String::from_utf8_lossy(&out.stdout).into_owned() + &String::from_utf8_lossy(&out.stderr);
    let interesting: Vec<&str> = log
        .lines()
        .filter(|l| {
            l.contains("netrc")
                || l.contains("Executing command")
                || l.contains("authenticators")
                || l.contains("Logging in")
        })
        .collect();
    eprintln!("{}", interesting.join("\n"));
    assert!(log.contains("Executing command:"), "{log}");
    assert!(
        log.contains("Using netrc for vimeo authentication"),
        "{log}"
    );
    assert!(!log.contains("Failed to parse .netrc"), "{log}");
    assert!(
        !log.contains("fake-Pass_123!"),
        "password leaked into yt-dlp output"
    );
}

#[test]
#[ignore = "needs YMD_TEST_YTDLP and YMD_TEST_BROWSER"]
fn snapshot_from_real_browser() {
    let Some(ytdlp) = ytdlp() else { return };
    let Some(spec) = std::env::var("YMD_TEST_BROWSER").ok() else {
        return;
    };
    let (name, profile) = match spec.split_once(':') {
        Some((n, p)) => (n.to_string(), Some(p.to_string())),
        None => (spec.clone(), None),
    };
    let browser: Browser = serde_json::from_value(serde_json::Value::String(name)).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let p = paths(dir.path());
    let tools = Tools {
        ytdlp: Some(ytdlp),
        ..Default::default()
    };
    let rt = tokio::runtime::Runtime::new().unwrap();
    match rt.block_on(cookies::snapshot(&tools, &p, browser, profile.as_deref())) {
        Ok(info) => eprintln!(
            "snapshot ok: {} cookies across {} domains",
            info.cookie_count,
            info.domains.len()
        ),
        Err(e) => {
            eprintln!("snapshot failed: {:?}: {}", e.code, e.detail);
            assert!(matches!(
                e.code,
                ErrorCode::CookiesLocked | ErrorCode::CookiesDecrypt | ErrorCode::Unknown
            ));
        }
    }
    // Whatever happened, no temp jar is left behind.
    if let Ok(rd) = std::fs::read_dir(p.auth_dir()) {
        for e in rd {
            let n = e.unwrap().file_name().to_string_lossy().into_owned();
            assert!(!n.ends_with(".tmp") && !n.ends_with(".info.json"), "{n}");
        }
    }
}

/// "Test cookies" against the real yt-dlp with an imported synthetic jar; yt-dlp writes the
/// jar back on exit and it must stay valid.
#[test]
#[ignore = "needs YMD_TEST_YTDLP"]
fn cookie_test_with_imported_file() {
    let Some(ytdlp) = ytdlp() else { return };
    let dir = tempfile::tempdir().unwrap();
    let p = paths(dir.path());
    let fixture =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/auth/cookies_valid.txt");
    cookies::import(&p, &fixture).unwrap();
    let tools = Tools {
        ytdlp: Some(ytdlp),
        ..Default::default()
    };
    let args = vec![
        "--cookies".to_string(),
        p.cookies_file().to_string_lossy().into_owned(),
    ];
    let rt = tokio::runtime::Runtime::new().unwrap();
    let r = rt.block_on(cookies::test(&tools, &args));
    eprintln!("cookie test: ok={} error={:?}", r.ok, r.error);
    // The file must still be a valid jar after yt-dlp wrote it back.
    assert!(cookies::info(&p).is_some());
}
