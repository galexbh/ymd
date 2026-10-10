//! «Descargar con ymd» from the browser: the cookie-bridge host receives a link from the
//! extension and launches `ymd --open-url <link>`. A running ymd gets that argv through the
//! single-instance plugin; a cold start reads it in `setup`. Either way the link waits in
//! [`PendingUrl`] until the UI takes it, fills Recibir and probes it. Nothing is downloaded
//! without the person's click.

use std::sync::Mutex;

/// Flag ymd is launched with when a link comes from the browser.
pub const OPEN_URL_FLAG: &str = "--open-url";
/// Same cap as the UI's link detection (`src/app/clipboardLink.ts`).
pub const MAX_URL_LEN: usize = 2048;

/// Normalized link when `raw` is one ymd may open: http(s), at most [`MAX_URL_LEN`] bytes, no
/// spaces or control characters, no `user:pass@`, and a host with a dot that isn't an IP.
pub fn valid_open_url(raw: &str) -> Option<String> {
    let s = raw.trim();
    if s.is_empty()
        || s.len() > MAX_URL_LEN
        || s.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return None;
    }
    let lower = s.to_ascii_lowercase();
    let rest = lower
        .strip_prefix("https://")
        .or_else(|| lower.strip_prefix("http://"))?;
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    if authority.contains('@') {
        return None;
    }
    let host = match authority.rsplit_once(':') {
        Some((h, port)) if !port.is_empty() && port.bytes().all(|b| b.is_ascii_digit()) => h,
        Some(_) => return None,
        None => authority,
    };
    let labels_ok = host
        .split('.')
        .all(|l| !l.is_empty() && l.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-'));
    let is_ip = host.bytes().all(|b| b.is_ascii_digit() || b == b'.');
    (host.contains('.') && labels_ok && !is_ip).then(|| s.to_string())
}

/// The link after [`OPEN_URL_FLAG`] in a command line, when it is a valid one.
pub fn parse_open_url_arg(args: &[String]) -> Option<String> {
    let i = args.iter().position(|a| a == OPEN_URL_FLAG)?;
    valid_open_url(args.get(i + 1)?)
}

/// The link waiting for the UI (set by a cold start or by another instance).
#[derive(Default)]
pub struct PendingUrl(pub Mutex<Option<String>>);

impl PendingUrl {
    pub fn set(&self, url: String) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(url);
    }
    pub fn take(&self) -> Option<String> {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).take()
    }
}

/// Starts `ymd --open-url <url>` detached from the host, so the browser closing the host
/// process (and its job on Windows) doesn't take ymd with it.
pub fn launch(url: &str) -> std::io::Result<()> {
    #[cfg(feature = "test-support")]
    if let Some(record) = std::env::var_os("YMD_TEST_OPEN_RECORD") {
        // Tests: record what would be launched instead of starting another ymd.
        return std::fs::write(record, format!("{OPEN_URL_FLAG} {url}"));
    }
    let exe = std::env::current_exe()?;
    let spawn = |flags: u32| {
        let mut cmd = std::process::Command::new(&exe);
        cmd.args([OPEN_URL_FLAG, url])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(flags);
        }
        #[cfg(not(windows))]
        let _ = flags;
        cmd.spawn().map(drop)
    };
    #[cfg(windows)]
    {
        // The browser's pipes are this process's stdio. If ymd inherited them, the browser
        // would keep waiting on a pipe that never closes; keep them to ourselves.
        use windows_sys::Win32::Foundation::{SetHandleInformation, HANDLE_FLAG_INHERIT};
        use windows_sys::Win32::System::Console::{
            GetStdHandle, STD_ERROR_HANDLE, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE,
        };
        for which in [STD_INPUT_HANDLE, STD_OUTPUT_HANDLE, STD_ERROR_HANDLE] {
            // SAFETY: plain Win32 calls on this process's own standard handles.
            unsafe {
                let h = GetStdHandle(which);
                if !h.is_null() {
                    SetHandleInformation(h, HANDLE_FLAG_INHERIT, 0);
                }
            }
        }
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;
        let base = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP;
        // Breaking away is only allowed when the browser's job permits it; else spawn inside.
        spawn(base | CREATE_BREAKAWAY_FROM_JOB).or_else(|_| spawn(base))
    }
    #[cfg(not(windows))]
    {
        spawn(0)
    }
}

/// Brings the main window to the front (restores it when minimized).
pub fn focus_main<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use tauri::Manager;
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_plain_web_links() {
        for ok in [
            "https://www.youtube.com/watch?v=jNQXAC9IVRw",
            "http://vimeo.com/123",
            "https://youtu.be/abc?t=10#x",
            "  https://music.youtube.com/playlist?list=PL1  ",
            "https://example.com:8443/a",
            "HTTPS://Example.COM/Path",
        ] {
            assert!(valid_open_url(ok).is_some(), "{ok}");
        }
        assert_eq!(
            valid_open_url("  https://a.com/x ").as_deref(),
            Some("https://a.com/x")
        );
    }

    #[test]
    fn refuses_anything_else() {
        let long = format!("https://a.com/{}", "x".repeat(MAX_URL_LEN));
        for bad in [
            "",
            "youtube.com/watch",
            "ftp://a.com/x",
            "file:///C:/x",
            "javascript:alert(1)",
            "https://user:pass@a.com/",
            "https://a.com@evil.com/",
            "https://localhost/x",
            "https://192.168.0.1/x",
            "https://a.com/x y",
            "https://a.com/\u{0}",
            "https://a..com/",
            "https://a.com:port/",
            "https://[::1]/",
            long.as_str(),
        ] {
            assert!(valid_open_url(bad).is_none(), "{bad:?}");
        }
    }

    #[test]
    fn reads_the_flag_from_a_command_line() {
        let args = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(
            parse_open_url_arg(&args(&["ymd.exe", OPEN_URL_FLAG, "https://a.com/v"])).as_deref(),
            Some("https://a.com/v")
        );
        assert_eq!(parse_open_url_arg(&args(&["ymd.exe"])), None);
        assert_eq!(parse_open_url_arg(&args(&["ymd.exe", OPEN_URL_FLAG])), None);
        assert_eq!(
            parse_open_url_arg(&args(&["ymd.exe", OPEN_URL_FLAG, "file:///etc/passwd"])),
            None
        );
    }

    #[test]
    fn pending_url_is_taken_once() {
        let p = PendingUrl::default();
        assert_eq!(p.take(), None);
        p.set("https://a.com/1".into());
        p.set("https://a.com/2".into());
        assert_eq!(p.take().as_deref(), Some("https://a.com/2"));
        assert_eq!(p.take(), None);
    }
}
