//! The user's default web browser, so the extension card and the cookie picker can start from
//! the browser the person actually uses.
//!
//! - Windows: `HKCU\…\Shell\Associations\UrlAssociations\https\UserChoice` → `ProgId`.
//! - macOS: LaunchServices `LSHandlers` for the `https` scheme → bundle id.
//! - Linux: `xdg-settings get default-web-browser` → `.desktop` id.

use super::browsers::Os;
use crate::model::Browser;

/// Pure: Windows `ProgId` (e.g. `BraveHTML`, `ChromeHTML`, `MSEdgeHTM`, `FirefoxURL-308046B0AF4A39CB`).
pub fn from_windows_progid(progid: &str) -> Option<Browser> {
    let p = progid.trim().to_ascii_lowercase();
    Some(match () {
        _ if p.starts_with("bravehtml") || p.starts_with("brave") => Browser::Brave,
        _ if p.starts_with("msedgehtm") || p.starts_with("msedge") => Browser::Edge,
        _ if p.starts_with("chromehtml") => Browser::Chrome,
        _ if p.starts_with("chromiumhtm") => Browser::Chromium,
        _ if p.starts_with("firefoxurl") || p.starts_with("firefox") => Browser::Firefox,
        _ if p.starts_with("vivaldihtm") || p.starts_with("vivaldi") => Browser::Vivaldi,
        _ if p.starts_with("opera") => Browser::Opera,
        _ if p.starts_with("whale") => Browser::Whale,
        _ => return None,
    })
}

/// Pure: macOS bundle id (e.g. `com.brave.browser`, `org.mozilla.firefox`).
pub fn from_mac_bundle_id(id: &str) -> Option<Browser> {
    let id = id.trim().to_ascii_lowercase();
    Some(match id.as_str() {
        "com.brave.browser" | "com.brave.browser.beta" | "com.brave.browser.nightly" => {
            Browser::Brave
        }
        "com.google.chrome" | "com.google.chrome.beta" | "com.google.chrome.canary" => {
            Browser::Chrome
        }
        "com.microsoft.edgemac" | "com.microsoft.edgemac.beta" => Browser::Edge,
        "org.chromium.chromium" => Browser::Chromium,
        "org.mozilla.firefox" | "org.mozilla.firefoxdeveloperedition" | "org.mozilla.nightly" => {
            Browser::Firefox
        }
        "com.apple.safari" => Browser::Safari,
        "com.vivaldi.vivaldi" => Browser::Vivaldi,
        "com.operasoftware.opera" => Browser::Opera,
        "com.naver.whale" => Browser::Whale,
        _ => return None,
    })
}

/// Pure: freedesktop `.desktop` id (e.g. `brave-browser.desktop`, `firefox_firefox.desktop`).
pub fn from_desktop_id(id: &str) -> Option<Browser> {
    let id = id.trim().to_ascii_lowercase();
    let id = id.strip_suffix(".desktop").unwrap_or(&id);
    Some(match () {
        _ if id.contains("brave") => Browser::Brave,
        _ if id.contains("microsoft-edge") => Browser::Edge,
        _ if id.contains("google-chrome") => Browser::Chrome,
        _ if id.contains("chromium") => Browser::Chromium,
        _ if id.contains("firefox") => Browser::Firefox,
        _ if id.contains("vivaldi") => Browser::Vivaldi,
        _ if id.contains("opera") => Browser::Opera,
        _ if id.contains("whale") => Browser::Whale,
        _ => return None,
    })
}

/// Pure: the bundle id handling `https` in `defaults read … LSHandlers` output.
pub fn mac_https_handler(defaults_output: &str) -> Option<String> {
    // Entries look like:
    //   {
    //       LSHandlerRoleAll = "com.brave.browser";
    //       LSHandlerURLScheme = https;
    //   },
    for entry in defaults_output.split('}') {
        let scheme = entry
            .lines()
            .find_map(|l| l.trim().strip_prefix("LSHandlerURLScheme = "))
            .map(|v| {
                v.trim_end_matches(';')
                    .trim_matches('"')
                    .to_ascii_lowercase()
            });
        if scheme.as_deref() == Some("https") {
            return entry
                .lines()
                .find_map(|l| l.trim().strip_prefix("LSHandlerRoleAll = "))
                .map(|v| v.trim_end_matches(';').trim_matches('"').to_string());
        }
    }
    None
}

#[cfg(windows)]
fn windows_progid() -> Option<String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    ["https", "http"].into_iter().find_map(|scheme| {
        RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(format!(
                r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\{scheme}\UserChoice"
            ))
            .and_then(|k| k.get_value::<String, _>("ProgId"))
            .ok()
    })
}

#[cfg(not(windows))]
fn windows_progid() -> Option<String> {
    None
}

fn run(program: &str, args: &[&str]) -> Option<String> {
    let out = std::process::Command::new(program)
        .args(args)
        .output()
        .ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Best effort: the user's default browser, or `None` when it can't be told.
pub fn detect() -> Option<Browser> {
    match Os::current() {
        Os::Windows => windows_progid().and_then(|p| from_windows_progid(&p)),
        Os::Mac => run(
            "defaults",
            &[
                "read",
                "com.apple.LaunchServices/com.apple.launchservices.secure",
                "LSHandlers",
            ],
        )
        .and_then(|o| mac_https_handler(&o))
        .and_then(|id| from_mac_bundle_id(&id)),
        Os::Linux => {
            run("xdg-settings", &["get", "default-web-browser"]).and_then(|o| from_desktop_id(&o))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_progids() {
        assert_eq!(from_windows_progid("BraveHTML"), Some(Browser::Brave));
        assert_eq!(from_windows_progid("ChromeHTML"), Some(Browser::Chrome));
        assert_eq!(from_windows_progid("MSEdgeHTM"), Some(Browser::Edge));
        assert_eq!(
            from_windows_progid("FirefoxURL-308046B0AF4A39CB"),
            Some(Browser::Firefox)
        );
        assert_eq!(
            from_windows_progid("ChromiumHTM.ABC"),
            Some(Browser::Chromium)
        );
        assert_eq!(
            from_windows_progid("VivaldiHTM.XYZ"),
            Some(Browser::Vivaldi)
        );
        assert_eq!(from_windows_progid("OperaStable"), Some(Browser::Opera));
        assert_eq!(from_windows_progid("IE.HTTP"), None);
        assert_eq!(from_windows_progid(""), None);
    }

    #[test]
    fn mac_bundle_ids() {
        assert_eq!(
            from_mac_bundle_id("com.brave.Browser"),
            Some(Browser::Brave)
        );
        assert_eq!(
            from_mac_bundle_id("com.google.Chrome"),
            Some(Browser::Chrome)
        );
        assert_eq!(
            from_mac_bundle_id("com.microsoft.edgemac"),
            Some(Browser::Edge)
        );
        assert_eq!(
            from_mac_bundle_id("org.mozilla.firefox"),
            Some(Browser::Firefox)
        );
        assert_eq!(
            from_mac_bundle_id("com.apple.Safari"),
            Some(Browser::Safari)
        );
        assert_eq!(from_mac_bundle_id("com.example.other"), None);
    }

    #[test]
    fn mac_defaults_output() {
        let out = r#"(
        {
        LSHandlerContentType = "public.html";
        LSHandlerRoleAll = "com.apple.safari";
    },
        {
        LSHandlerPreferredVersions =         {
            LSHandlerRoleAll = "-";
        };
        LSHandlerRoleAll = "com.brave.browser";
        LSHandlerURLScheme = https;
    },
        {
        LSHandlerRoleAll = "com.google.chrome";
        LSHandlerURLScheme = http;
    }
)"#;
        assert_eq!(mac_https_handler(out).as_deref(), Some("com.brave.browser"));
        assert_eq!(mac_https_handler("()"), None);
    }

    #[test]
    fn desktop_ids() {
        assert_eq!(
            from_desktop_id("brave-browser.desktop\n"),
            Some(Browser::Brave)
        );
        assert_eq!(
            from_desktop_id("firefox_firefox.desktop"),
            Some(Browser::Firefox)
        );
        assert_eq!(
            from_desktop_id("google-chrome.desktop"),
            Some(Browser::Chrome)
        );
        assert_eq!(
            from_desktop_id("microsoft-edge.desktop"),
            Some(Browser::Edge)
        );
        assert_eq!(
            from_desktop_id("org.chromium.Chromium.desktop"),
            Some(Browser::Chromium)
        );
        assert_eq!(from_desktop_id("org.gnome.Epiphany.desktop"), None);
    }

    #[test]
    fn detect_on_this_machine_does_not_panic() {
        let _ = detect();
    }
}
