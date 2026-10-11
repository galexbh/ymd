//! Spawning external tools consistently: no console window on Windows, own
//! process group on Unix (so a cancel can take ffmpeg down with yt-dlp), and
//! killed when dropped.

use std::ffi::OsStr;
use tokio::process::{Child, Command};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// A `tokio::process::Command` prepared for a background tool.
pub fn command(program: impl AsRef<OsStr>) -> Command {
    let mut cmd = Command::new(program);
    cmd.kill_on_drop(true);
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(unix)]
    {
        cmd.process_group(0);
    }
    cmd
}

/// Time limit for the small system queries ymd runs synchronously (`tasklist`, `ps`,
/// `defaults`, `xdg-settings`): a stuck one must not stall the screen that asked.
pub const QUERY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

/// Runs a blocking `cmd` (stdin null, stdout piped, stderr discarded) and returns its stdout
/// when it exits successfully within `timeout`. On timeout the process is killed and `None`
/// comes back.
pub fn stdout_within(
    mut cmd: std::process::Command,
    timeout: std::time::Duration,
) -> Option<Vec<u8>> {
    use std::io::Read;
    let mut child = cmd
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .ok()?;
    let mut out = child.stdout.take()?;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = out.read_to_end(&mut buf);
        let _ = tx.send(buf);
    });
    let deadline = std::time::Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if std::time::Instant::now() < deadline => {
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    };
    let left = deadline.saturating_duration_since(std::time::Instant::now());
    let stdout = rx
        .recv_timeout(left.max(std::time::Duration::from_millis(500)))
        .ok()?;
    status.success().then_some(stdout)
}

/// Kill a child and every process it spawned (yt-dlp → ffmpeg / aria2c).
pub async fn kill_tree(child: &mut Child) {
    let Some(pid) = child.id() else {
        return; // already exited
    };
    #[cfg(windows)]
    {
        let _ = command("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .await;
    }
    #[cfg(unix)]
    {
        // Negative pid = the whole process group created by `process_group(0)`.
        unsafe {
            libc::kill(-(pid as i32), libc::SIGTERM);
        }
        if tokio::time::timeout(std::time::Duration::from_secs(3), child.wait())
            .await
            .is_err()
        {
            unsafe {
                libc::kill(-(pid as i32), libc::SIGKILL);
            }
        }
    }
    let _ = child.kill().await;
    let _ = child.wait().await;
}
