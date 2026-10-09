//! `report` / `tools` / `remove` with a tool found on PATH. Lives in its own test binary
//! because it replaces the process-wide PATH.

use ymd_lib::deps::manager::DepsManager;
use ymd_lib::model::{DepId, DepState, UpdateChannel};
use ymd_lib::paths::AppPaths;

#[tokio::test]
async fn system_tools_are_detected_and_never_removed() {
    let dir = tempfile::tempdir().unwrap();
    let sys = dir.path().join("system-bin");
    std::fs::create_dir_all(&sys).unwrap();

    // A fake aria2c that prints a real-looking banner.
    #[cfg(windows)]
    let fake = {
        let p = sys.join("aria2c.cmd");
        std::fs::write(&p, "@echo aria2 version 1.36.0\r\n").unwrap();
        p
    };
    #[cfg(unix)]
    let fake = {
        use std::os::unix::fs::PermissionsExt;
        let p = sys.join("aria2c");
        std::fs::write(&p, "#!/bin/sh\necho 'aria2 version 1.36.0'\n").unwrap();
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
        p
    };
    // Only our directory on PATH (plus the Windows system dir so `.cmd` files can run).
    let mut path_dirs = vec![sys.clone()];
    if cfg!(windows) {
        if let Some(root) = std::env::var_os("SystemRoot") {
            path_dirs.push(std::path::PathBuf::from(root).join("System32"));
        }
    }
    std::env::set_var("PATH", std::env::join_paths(path_dirs).unwrap());

    let bin = dir.path().join("bin");
    let paths = AppPaths::new(
        dir.path().join("data"),
        dir.path().join("config"),
        Some(bin.to_str().unwrap()),
    );
    let mgr = DepsManager::with_api_base(paths, UpdateChannel::Stable, "http://127.0.0.1:9".into());

    let report = mgr.report(false).await.unwrap();
    let aria = report.deps.iter().find(|d| d.id == DepId::Aria2c).unwrap();
    assert_eq!(aria.state, DepState::System, "{aria:?}");
    assert_eq!(aria.version.as_deref(), Some("1.36.0"), "{aria:?}");
    assert!(aria.path.as_deref().unwrap().contains("system-bin"));
    assert!(!aria.verified);

    let ytdlp = report.deps.iter().find(|d| d.id == DepId::Ytdlp).unwrap();
    if !cfg!(target_os = "macos") {
        // macOS also looks in Homebrew dirs, which may hold a real yt-dlp.
        assert_eq!(ytdlp.state, DepState::Missing);
        assert!(ytdlp.path.is_none() && ytdlp.version.is_none());
    }
    assert!(ytdlp.can_install);

    let tools = mgr.tools().await;
    assert_eq!(tools.aria2c.as_deref(), Some(fake.as_path()));

    // A managed copy wins over the system one.
    std::fs::create_dir_all(&bin).unwrap();
    let managed = mgr.paths.bin("aria2c");
    std::fs::write(&managed, b"managed").unwrap();
    assert_eq!(mgr.tools().await.aria2c.as_deref(), Some(managed.as_path()));
    let report = mgr.report(false).await.unwrap();
    let aria = report.deps.iter().find(|d| d.id == DepId::Aria2c).unwrap();
    assert_eq!(aria.state, DepState::Installed);

    // `remove` takes the managed copy and leaves the system one alone.
    mgr.remove(DepId::Aria2c).await.unwrap();
    assert!(!managed.exists());
    assert!(fake.exists());
    assert_eq!(tools.aria2c.as_deref(), Some(fake.as_path()));
}
