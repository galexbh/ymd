//! Locating a Chromium browser's executable to open its extensions page
//! (`brave://extensions`, ...). The opener plugin cannot open those schemes, so the browser
//! itself is launched with the URL.

use super::browsers::Os;
use crate::model::{Browser, CmdResult, CommandError, ErrorCode};
use std::path::PathBuf;

/// The browser's internal extensions page, or `None` for browsers the bridge does not support.
pub fn extensions_url(b: Browser) -> Option<&'static str> {
    Some(match b {
        Browser::Brave => "brave://extensions",
        Browser::Chrome | Browser::Chromium => "chrome://extensions",
        Browser::Edge => "edge://extensions",
        Browser::Vivaldi => "vivaldi://extensions",
        _ => return None,
    })
}

/// Windows roots used to build install-path candidates.
#[derive(Debug, Clone, Default)]
pub(crate) struct WinRoots {
    pub local_appdata: Option<PathBuf>,
    pub program_files: Option<PathBuf>,
    pub program_files_x86: Option<PathBuf>,
}

impl WinRoots {
    fn from_process() -> Self {
        let var = |k: &str| {
            std::env::var_os(k)
                .filter(|v| !v.is_empty())
                .map(PathBuf::from)
        };
        WinRoots {
            local_appdata: var("LOCALAPPDATA"),
            program_files: var("ProgramFiles"),
            program_files_x86: var("ProgramFiles(x86)"),
        }
    }
}

/// `App Paths` registry name (Windows). Chromium has none (its `chrome.exe` would be Chrome's).
fn app_paths_name(b: Browser) -> Option<&'static str> {
    Some(match b {
        Browser::Brave => "brave.exe",
        Browser::Chrome => "chrome.exe",
        Browser::Edge => "msedge.exe",
        Browser::Vivaldi => "vivaldi.exe",
        _ => return None,
    })
}

/// Pure (Windows): known per-user and per-machine install paths, most likely first.
pub(crate) fn windows_candidates(b: Browser, roots: &WinRoots) -> Vec<PathBuf> {
    let (rel, user_first): (&str, bool) = match b {
        Browser::Brave => (r"BraveSoftware\Brave-Browser\Application\brave.exe", false),
        Browser::Chrome => (r"Google\Chrome\Application\chrome.exe", false),
        Browser::Edge => (r"Microsoft\Edge\Application\msedge.exe", false),
        Browser::Chromium => (r"Chromium\Application\chrome.exe", true),
        Browser::Vivaldi => (r"Vivaldi\Application\vivaldi.exe", true),
        _ => return Vec::new(),
    };
    let machine = [&roots.program_files, &roots.program_files_x86];
    let user = [&roots.local_appdata];
    let order: Vec<&Option<PathBuf>> = if user_first {
        user.into_iter().chain(machine).collect()
    } else {
        machine.into_iter().chain(user).collect()
    };
    order.into_iter().flatten().map(|r| r.join(rel)).collect()
}

/// Pure (macOS): application name for `open -a`.
pub(crate) fn mac_app_name(b: Browser) -> Option<&'static str> {
    Some(match b {
        Browser::Brave => "Brave Browser",
        Browser::Chrome => "Google Chrome",
        Browser::Edge => "Microsoft Edge",
        Browser::Chromium => "Chromium",
        Browser::Vivaldi => "Vivaldi",
        _ => return None,
    })
}

/// Pure (Linux): executable names to look up on `PATH`.
pub(crate) fn linux_names(b: Browser) -> &'static [&'static str] {
    match b {
        Browser::Brave => &["brave-browser", "brave", "brave-browser-stable"],
        Browser::Chrome => &["google-chrome", "google-chrome-stable"],
        Browser::Edge => &["microsoft-edge", "microsoft-edge-stable"],
        Browser::Chromium => &["chromium", "chromium-browser"],
        Browser::Vivaldi => &["vivaldi", "vivaldi-stable"],
        _ => &[],
    }
}

#[cfg(windows)]
fn app_paths_lookup(name: &str) -> Option<PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;
    let key = format!(r"Software\Microsoft\Windows\CurrentVersion\App Paths\{name}");
    [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE]
        .into_iter()
        .find_map(|hive| {
            RegKey::predef(hive)
                .open_subkey(&key)
                .and_then(|k| k.get_value::<String, _>(""))
                .ok()
        })
        .map(|v| PathBuf::from(v.trim().trim_matches('"')))
        .filter(|p| p.is_file())
}

#[cfg(not(windows))]
fn app_paths_lookup(_name: &str) -> Option<PathBuf> {
    None
}

/// Program + argv that open `browser` on its extensions page.
pub fn launch_command(browser: Browser) -> CmdResult<(PathBuf, Vec<String>)> {
    let not_supported = || {
        CommandError::new(
            ErrorCode::Unknown,
            format!("{browser:?} is not supported by the cookie bridge"),
        )
    };
    let url = extensions_url(browser).ok_or_else(not_supported)?;
    let not_found = || {
        CommandError::new(
            ErrorCode::BinaryMissing,
            format!("could not find the {browser:?} executable"),
        )
    };
    match Os::current() {
        Os::Windows => {
            let exe = app_paths_name(browser)
                .and_then(app_paths_lookup)
                .or_else(|| {
                    windows_candidates(browser, &WinRoots::from_process())
                        .into_iter()
                        .find(|p| p.is_file())
                })
                .ok_or_else(not_found)?;
            Ok((exe, vec![url.to_string()]))
        }
        Os::Mac => {
            let app = mac_app_name(browser).ok_or_else(not_supported)?;
            Ok((
                PathBuf::from("/usr/bin/open"),
                vec!["-a".into(), app.into(), url.into()],
            ))
        }
        Os::Linux => {
            let exe = linux_names(browser)
                .iter()
                .find_map(|n| which::which(n).ok())
                .ok_or_else(not_found)?;
            Ok((exe, vec![url.to_string()]))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urls() {
        assert_eq!(extensions_url(Browser::Brave), Some("brave://extensions"));
        assert_eq!(extensions_url(Browser::Chrome), Some("chrome://extensions"));
        assert_eq!(
            extensions_url(Browser::Chromium),
            Some("chrome://extensions")
        );
        assert_eq!(extensions_url(Browser::Edge), Some("edge://extensions"));
        assert_eq!(
            extensions_url(Browser::Vivaldi),
            Some("vivaldi://extensions")
        );
        for b in [
            Browser::Firefox,
            Browser::Safari,
            Browser::Opera,
            Browser::Whale,
        ] {
            assert_eq!(extensions_url(b), None);
            assert!(launch_command(b).is_err());
            assert!(mac_app_name(b).is_none());
            assert!(linux_names(b).is_empty());
        }
    }

    #[test]
    fn windows_paths() {
        let roots = WinRoots {
            local_appdata: Some(PathBuf::from(r"C:\U\Local")),
            program_files: Some(PathBuf::from(r"C:\PF")),
            program_files_x86: Some(PathBuf::from(r"C:\PF86")),
        };
        let s = |b| {
            windows_candidates(b, &roots)
                .into_iter()
                .map(|p| p.to_string_lossy().replace('/', "\\"))
                .collect::<Vec<_>>()
        };
        assert_eq!(
            s(Browser::Brave),
            [
                r"C:\PF\BraveSoftware\Brave-Browser\Application\brave.exe",
                r"C:\PF86\BraveSoftware\Brave-Browser\Application\brave.exe",
                r"C:\U\Local\BraveSoftware\Brave-Browser\Application\brave.exe",
            ]
        );
        assert_eq!(
            s(Browser::Edge)[1],
            r"C:\PF86\Microsoft\Edge\Application\msedge.exe"
        );
        assert_eq!(
            s(Browser::Chromium)[0],
            r"C:\U\Local\Chromium\Application\chrome.exe"
        );
        assert_eq!(
            s(Browser::Vivaldi)[0],
            r"C:\U\Local\Vivaldi\Application\vivaldi.exe"
        );
        assert!(s(Browser::Firefox).is_empty());
        assert!(windows_candidates(Browser::Chrome, &WinRoots::default()).is_empty());
    }
}
