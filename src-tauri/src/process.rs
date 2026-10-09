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
