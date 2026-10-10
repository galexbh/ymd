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

/// The default browser as the extension card needs it: a display name, whether it is a
/// Chromium browser (so the ymd extension can be installed in it), the yt-dlp `Browser` when
/// it is one, and on Windows the executable to launch it with.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DefaultBrowser {
    pub name: String,
    pub chromium: bool,
    pub browser: Option<Browser>,
    pub exe: Option<std::path::PathBuf>,
}

/// Pure: name / Chromium-ness of a browser executable. Many Chromium forks have no yt-dlp
/// browser key (Arc, Yandex, Thorium…), so they are recognised by their executable.
pub fn classify_exe(path: &std::path::Path) -> (String, bool, Option<Browser>) {
    let file = path
        .file_name()
        .map(|f| f.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    let full = path.to_string_lossy().to_ascii_lowercase();
    let named = |n: &str, chromium: bool, b: Option<Browser>| (n.to_string(), chromium, b);
    match file.as_str() {
        "brave.exe" => named("Brave", true, Some(Browser::Brave)),
        "msedge.exe" => named("Edge", true, Some(Browser::Edge)),
        "vivaldi.exe" => named("Vivaldi", true, Some(Browser::Vivaldi)),
        "whale.exe" => named("Whale", true, Some(Browser::Whale)),
        "chrome.exe" if full.contains("chromium") => {
            named("Chromium", true, Some(Browser::Chromium))
        }
        "chrome.exe" => named("Chrome", true, Some(Browser::Chrome)),
        "opera.exe" | "launcher.exe" if full.contains("opera gx") => {
            named("Opera GX", true, Some(Browser::Opera))
        }
        "opera.exe" | "launcher.exe" if full.contains("opera") => {
            named("Opera", true, Some(Browser::Opera))
        }
        "browser.exe" if full.contains("yandex") => named("Yandex", true, None),
        "arc.exe" => named("Arc", true, None),
        "thorium.exe" => named("Thorium", true, None),
        "firefox.exe" => named("Firefox", false, Some(Browser::Firefox)),
        _ => {
            let stem = path
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            let mut c = stem.chars();
            let name = c
                .next()
                .map(|f| f.to_uppercase().collect::<String>() + c.as_str())
                .unwrap_or_default();
            (name, false, None)
        }
    }
}

/// Pure: the executable from a shell `open\command` value (`"C:\…\opera.exe" --single-argument %1`).
pub fn exe_from_open_command(command: &str) -> Option<std::path::PathBuf> {
    let c = command.trim();
    let exe = if let Some(rest) = c.strip_prefix('"') {
        rest.split('"').next()?
    } else {
        c.split_whitespace().next()?
    };
    (!exe.is_empty()).then(|| std::path::PathBuf::from(exe))
}

#[cfg(windows)]
fn windows_exe_for_progid(progid: &str) -> Option<std::path::PathBuf> {
    use winreg::enums::{HKEY_CLASSES_ROOT, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;
    let read = |hive, key: String| {
        RegKey::predef(hive)
            .open_subkey(key)
            .and_then(|k| k.get_value::<String, _>(""))
            .ok()
    };
    let rel = format!(r"{progid}\shell\open\command");
    read(HKEY_CURRENT_USER, format!(r"Software\Classes\{rel}"))
        .or_else(|| read(HKEY_LOCAL_MACHINE, format!(r"Software\Classes\{rel}")))
        .or_else(|| read(HKEY_CLASSES_ROOT, rel))
        .and_then(|c| exe_from_open_command(&c))
}

#[cfg(not(windows))]
fn windows_exe_for_progid(_progid: &str) -> Option<std::path::PathBuf> {
    None
}

/// Pure: Chromium forks without a yt-dlp key, by macOS bundle id / Linux desktop id.
fn chromium_fork_name(id: &str) -> Option<&'static str> {
    let id = id.to_ascii_lowercase();
    Some(match () {
        _ if id.contains("thebrowser") || id.starts_with("arc") => "Arc",
        _ if id.contains("yandex") => "Yandex",
        _ if id.contains("thorium") => "Thorium",
        _ if id.contains("operagx") || id.contains("opera-gx") => "Opera GX",
        _ => return None,
    })
}

fn from_browser(b: Browser) -> DefaultBrowser {
    let name = match b {
        Browser::Brave => "Brave",
        Browser::Chrome => "Chrome",
        Browser::Chromium => "Chromium",
        Browser::Edge => "Edge",
        Browser::Firefox => "Firefox",
        Browser::Opera => "Opera",
        Browser::Safari => "Safari",
        Browser::Vivaldi => "Vivaldi",
        Browser::Whale => "Whale",
    };
    DefaultBrowser {
        name: name.into(),
        chromium: !matches!(b, Browser::Firefox | Browser::Safari),
        browser: Some(b),
        exe: None,
    }
}

/// Best effort: everything the card needs about the default browser.
pub fn detect_info() -> Option<DefaultBrowser> {
    match Os::current() {
        Os::Windows => {
            let progid = windows_progid()?;
            if let Some(exe) = windows_exe_for_progid(&progid) {
                let (name, chromium, browser) = classify_exe(&exe);
                return Some(DefaultBrowser {
                    name,
                    chromium,
                    browser: browser.or_else(|| from_windows_progid(&progid)),
                    exe: Some(exe),
                });
            }
            from_windows_progid(&progid).map(from_browser)
        }
        Os::Mac => {
            let id = run(
                "defaults",
                &[
                    "read",
                    "com.apple.LaunchServices/com.apple.launchservices.secure",
                    "LSHandlers",
                ],
            )
            .and_then(|o| mac_https_handler(&o))?;
            from_mac_bundle_id(&id).map(from_browser).or_else(|| {
                chromium_fork_name(&id).map(|n| DefaultBrowser {
                    name: n.into(),
                    chromium: true,
                    browser: None,
                    exe: None,
                })
            })
        }
        Os::Linux => {
            let id = run("xdg-settings", &["get", "default-web-browser"])?;
            from_desktop_id(&id).map(from_browser).or_else(|| {
                chromium_fork_name(&id).map(|n| DefaultBrowser {
                    name: n.into(),
                    chromium: true,
                    browser: None,
                    exe: None,
                })
            })
        }
    }
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
        let _ = detect_info();
    }

    #[test]
    fn exes_of_chromium_forks() {
        use std::path::Path;
        let c = |p: &str| classify_exe(Path::new(p));
        assert_eq!(
            c(r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"),
            ("Brave".into(), true, Some(Browser::Brave))
        );
        assert_eq!(
            c(r"C:\Users\u\AppData\Local\Programs\Opera GX\launcher.exe"),
            ("Opera GX".into(), true, Some(Browser::Opera))
        );
        assert_eq!(
            c(r"C:\Users\u\AppData\Local\Programs\Opera\opera.exe"),
            ("Opera".into(), true, Some(Browser::Opera))
        );
        assert_eq!(
            c(r"C:\Users\u\AppData\Local\Yandex\YandexBrowser\Application\browser.exe"),
            ("Yandex".into(), true, None)
        );
        assert_eq!(
            c(r"C:\Program Files\WindowsApps\TheBrowserCompany.Arc_1\Arc.exe"),
            ("Arc".into(), true, None)
        );
        assert_eq!(
            c(r"C:\Users\u\AppData\Local\Chromium\Application\chrome.exe"),
            ("Chromium".into(), true, Some(Browser::Chromium))
        );
        assert_eq!(
            c(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
            ("Chrome".into(), true, Some(Browser::Chrome))
        );
        assert_eq!(
            c(r"C:\Program Files\Mozilla Firefox\firefox.exe"),
            ("Firefox".into(), false, Some(Browser::Firefox))
        );
        assert_eq!(
            c(r"C:\Apps\librewolf.exe"),
            ("Librewolf".into(), false, None)
        );
    }

    #[test]
    fn open_commands() {
        assert_eq!(
            exe_from_open_command(r#""C:\Program Files\Opera\opera.exe" --single-argument %1"#),
            Some(std::path::PathBuf::from(
                r"C:\Program Files\Opera\opera.exe"
            ))
        );
        assert_eq!(
            exe_from_open_command(r"C:\Apps\browser.exe -- %1"),
            Some(std::path::PathBuf::from(r"C:\Apps\browser.exe"))
        );
        assert_eq!(exe_from_open_command("  "), None);
    }

    #[test]
    fn fork_ids() {
        assert_eq!(
            chromium_fork_name("company.thebrowser.Browser"),
            Some("Arc")
        );
        assert_eq!(
            chromium_fork_name("ru.yandex.desktop.yandex-browser"),
            Some("Yandex")
        );
        assert_eq!(chromium_fork_name("yandex-browser.desktop"), Some("Yandex"));
        assert_eq!(
            chromium_fork_name("com.operasoftware.OperaGX"),
            Some("Opera GX")
        );
        assert_eq!(chromium_fork_name("org.gnome.Epiphany"), None);
    }
}
