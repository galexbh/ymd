//! Browser + profile discovery for `--cookies-from-browser`. Owner: C.
//! Brave is first-class: profiles come from `Local State` (`profile.info_cache`).
//!
//! Data directories mirror yt-dlp's own lookup (`yt_dlp/cookies.py`), so a browser listed here
//! is one yt-dlp can find: Chromium-family profile ids are directory names relative to the
//! user-data dir (`Default`, `Profile 1`); Firefox profile ids are absolute profile paths.

use crate::model::{Browser, BrowserInfo, BrowserProfile};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// Installed browsers with their profiles, Brave first.
pub fn detect() -> Vec<BrowserInfo> {
    let env = Env::from_process();
    let running = running_processes();
    detect_in(Os::current(), &env, &running)
}

/// Pure: Chromium `Local State` JSON → profiles (dir id + display name), Default first.
pub fn parse_chromium_local_state(json: &str) -> Vec<BrowserProfile> {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(json) else {
        return Vec::new();
    };
    let Some(cache) = v
        .get("profile")
        .and_then(|p| p.get("info_cache"))
        .and_then(|c| c.as_object())
    else {
        return Vec::new();
    };
    let mut profiles: Vec<BrowserProfile> = cache
        .iter()
        .map(|(id, info)| BrowserProfile {
            id: id.clone(),
            name: info
                .get("name")
                .and_then(|n| n.as_str())
                .map(str::trim)
                .filter(|n| !n.is_empty())
                .unwrap_or(id)
                .to_string(),
        })
        .collect();
    profiles.sort_by_key(|p| profile_order_key(&p.id));
    profiles
}

/// `Default` first, then `Profile N` by number, then anything else alphabetically.
fn profile_order_key(id: &str) -> (u8, u64, String) {
    if id == "Default" {
        return (0, 0, String::new());
    }
    if let Some(n) = id
        .strip_prefix("Profile ")
        .and_then(|n| n.parse::<u64>().ok())
    {
        return (1, n, String::new());
    }
    (2, 0, id.to_string())
}

#[derive(Debug, Clone, PartialEq)]
struct FirefoxProfile {
    path: String,
    name: String,
    relative: bool,
}

/// Pure: Firefox `profiles.ini` → profiles (path id + name), default first.
///
/// The id is the `Path=` value as written (relative to the ini's directory when `IsRelative=1`);
/// [`detect`] turns it into an absolute path, which is what yt-dlp needs.
pub fn parse_firefox_profiles_ini(ini: &str) -> Vec<BrowserProfile> {
    parse_firefox_entries(ini)
        .into_iter()
        .map(|p| BrowserProfile {
            id: p.path,
            name: p.name,
        })
        .collect()
}

fn parse_firefox_entries(ini: &str) -> Vec<FirefoxProfile> {
    #[derive(Default)]
    struct Section {
        name: String,
        keys: Vec<(String, String)>,
    }
    let mut sections: Vec<Section> = Vec::new();
    for raw in ini.lines() {
        let line = raw.trim().trim_start_matches('\u{feff}');
        if line.is_empty() || line.starts_with(';') || line.starts_with('#') {
            continue;
        }
        if let Some(name) = line.strip_prefix('[').and_then(|l| l.strip_suffix(']')) {
            sections.push(Section {
                name: name.trim().to_string(),
                keys: Vec::new(),
            });
        } else if let (Some(sec), Some((k, v))) = (sections.last_mut(), line.split_once('=')) {
            sec.keys.push((k.trim().to_string(), v.trim().to_string()));
        }
    }
    let get = |s: &Section, key: &str| {
        s.keys
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(key))
            .map(|(_, v)| v.clone())
    };

    // Modern Firefox: `[Install<hash>] Default=<path>` names each installation's default.
    let install_defaults: Vec<String> = sections
        .iter()
        .filter(|s| s.name.starts_with("Install"))
        .filter_map(|s| get(s, "Default"))
        .collect();

    let mut profiles: Vec<(u8, usize, FirefoxProfile)> = Vec::new();
    for (idx, s) in sections.iter().enumerate() {
        if !s.name.starts_with("Profile") {
            continue;
        }
        let Some(path) = get(s, "Path").filter(|p| !p.is_empty()) else {
            continue;
        };
        let relative = get(s, "IsRelative").map(|v| v != "0").unwrap_or(true);
        let name = get(s, "Name")
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| path.clone());
        let rank = if let Some(i) = install_defaults.iter().position(|d| *d == path) {
            i.min(100) as u8
        } else if get(s, "Default").as_deref() == Some("1") {
            101
        } else {
            102
        };
        if profiles.iter().any(|(_, _, p)| p.path == path) {
            continue;
        }
        profiles.push((
            rank,
            idx,
            FirefoxProfile {
                path,
                name,
                relative,
            },
        ));
    }
    profiles.sort_by_key(|(rank, idx, _)| (*rank, *idx));
    profiles.into_iter().map(|(_, _, p)| p).collect()
}

// ───────────────────────────── platform layout ─────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Os {
    Windows,
    Mac,
    Linux,
}

impl Os {
    fn current() -> Self {
        if cfg!(windows) {
            Os::Windows
        } else if cfg!(target_os = "macos") {
            Os::Mac
        } else {
            Os::Linux
        }
    }
}

/// The few environment roots the layout depends on.
#[derive(Debug, Clone, Default)]
pub(crate) struct Env {
    pub home: Option<PathBuf>,
    /// Windows `%LOCALAPPDATA%`.
    pub local_appdata: Option<PathBuf>,
    /// Windows `%APPDATA%`.
    pub appdata: Option<PathBuf>,
    /// `$XDG_CONFIG_HOME` (defaults to `~/.config`).
    pub xdg_config: Option<PathBuf>,
}

impl Env {
    fn from_process() -> Self {
        let var = |k: &str| {
            std::env::var_os(k)
                .filter(|v| !v.is_empty())
                .map(PathBuf::from)
        };
        let home = var(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).or_else(|| var("HOME"));
        Env {
            xdg_config: var("XDG_CONFIG_HOME").or_else(|| home.as_ref().map(|h| h.join(".config"))),
            home,
            local_appdata: var("LOCALAPPDATA"),
            appdata: var("APPDATA"),
        }
    }
}

/// Order shown in the UI: Brave first.
const ORDER: [Browser; 9] = [
    Browser::Brave,
    Browser::Chrome,
    Browser::Edge,
    Browser::Firefox,
    Browser::Chromium,
    Browser::Opera,
    Browser::Vivaldi,
    Browser::Whale,
    Browser::Safari,
];

/// Chromium user-data dir (the one holding `Local State`), as yt-dlp resolves it.
fn chromium_dir(os: Os, env: &Env, b: Browser) -> Option<PathBuf> {
    match os {
        Os::Windows => {
            let local = env.local_appdata.as_ref();
            match b {
                Browser::Brave => local.map(|d| d.join(r"BraveSoftware\Brave-Browser\User Data")),
                Browser::Chrome => local.map(|d| d.join(r"Google\Chrome\User Data")),
                Browser::Chromium => local.map(|d| d.join(r"Chromium\User Data")),
                Browser::Edge => local.map(|d| d.join(r"Microsoft\Edge\User Data")),
                Browser::Opera => env
                    .appdata
                    .as_ref()
                    .map(|d| d.join(r"Opera Software\Opera Stable")),
                Browser::Vivaldi => local.map(|d| d.join(r"Vivaldi\User Data")),
                Browser::Whale => local.map(|d| d.join(r"Naver\Naver Whale\User Data")),
                Browser::Firefox | Browser::Safari => None,
            }
        }
        Os::Mac => {
            let base = env.home.as_ref()?.join("Library/Application Support");
            let rel = match b {
                Browser::Brave => "BraveSoftware/Brave-Browser",
                Browser::Chrome => "Google/Chrome",
                Browser::Chromium => "Chromium",
                Browser::Edge => "Microsoft Edge",
                Browser::Opera => "com.operasoftware.Opera",
                Browser::Vivaldi => "Vivaldi",
                Browser::Whale => "Naver/Whale",
                Browser::Firefox | Browser::Safari => return None,
            };
            Some(base.join(rel))
        }
        Os::Linux => {
            let base = env.xdg_config.clone()?;
            let rel = match b {
                Browser::Brave => "BraveSoftware/Brave-Browser",
                Browser::Chrome => "google-chrome",
                Browser::Chromium => "chromium",
                Browser::Edge => "microsoft-edge",
                Browser::Opera => "opera",
                Browser::Vivaldi => "vivaldi",
                Browser::Whale => "naver-whale",
                Browser::Firefox | Browser::Safari => return None,
            };
            Some(base.join(rel))
        }
    }
}

/// Directories that may hold a Firefox `profiles.ini` (yt-dlp's `_firefox_browser_dirs`, minus
/// the trailing `Profiles`).
fn firefox_roots(os: Os, env: &Env) -> Vec<PathBuf> {
    let mut v = Vec::new();
    match os {
        Os::Windows => {
            if let Some(d) = &env.appdata {
                v.push(d.join(r"Mozilla\Firefox"));
            }
            if let Some(d) = &env.local_appdata {
                v.push(d.join(
                    r"Packages\Mozilla.Firefox_n80bbvh6b1yt2\LocalCache\Roaming\Mozilla\Firefox",
                ));
            }
        }
        Os::Mac => {
            if let Some(h) = &env.home {
                v.push(h.join("Library/Application Support/Firefox"));
            }
        }
        Os::Linux => {
            if let Some(x) = &env.xdg_config {
                v.push(x.join("mozilla/firefox"));
            }
            if let Some(h) = &env.home {
                v.push(h.join(".mozilla/firefox"));
                v.push(h.join(".var/app/org.mozilla.firefox/config/mozilla/firefox"));
                v.push(h.join(".var/app/org.mozilla.firefox/.mozilla/firefox"));
                v.push(h.join("snap/firefox/common/.mozilla/firefox"));
            }
        }
    }
    v
}

fn safari_present(os: Os, env: &Env) -> bool {
    if os != Os::Mac {
        return false;
    }
    let Some(h) = &env.home else { return false };
    [
        "Library/Containers/com.apple.Safari/Data/Library/Cookies",
        "Library/Cookies/Cookies.binarycookies",
        "Library/Safari",
    ]
    .iter()
    .any(|p| h.join(p).exists())
}

/// Lower-case process names that indicate the browser is running.
fn process_names(os: Os, b: Browser) -> &'static [&'static str] {
    match (os, b) {
        (Os::Windows, Browser::Brave) => &["brave.exe"],
        (Os::Windows, Browser::Chrome | Browser::Chromium) => &["chrome.exe"],
        (Os::Windows, Browser::Edge) => &["msedge.exe"],
        (Os::Windows, Browser::Opera) => &["opera.exe"],
        (Os::Windows, Browser::Vivaldi) => &["vivaldi.exe"],
        (Os::Windows, Browser::Whale) => &["whale.exe"],
        (Os::Windows, Browser::Firefox) => &["firefox.exe"],
        (Os::Windows, Browser::Safari) => &[],
        (Os::Mac, Browser::Brave) => &["brave browser"],
        (Os::Mac, Browser::Chrome) => &["google chrome"],
        (Os::Mac, Browser::Chromium) => &["chromium"],
        (Os::Mac, Browser::Edge) => &["microsoft edge"],
        (Os::Mac, Browser::Opera) => &["opera"],
        (Os::Mac, Browser::Vivaldi) => &["vivaldi"],
        (Os::Mac, Browser::Whale) => &["whale"],
        (Os::Mac, Browser::Firefox) => &["firefox"],
        (Os::Mac, Browser::Safari) => &["safari"],
        // Linux `comm` is truncated to 15 bytes.
        (Os::Linux, Browser::Brave) => &["brave", "brave-browser"],
        (Os::Linux, Browser::Chrome) => &["chrome", "google-chrome"],
        (Os::Linux, Browser::Chromium) => &["chromium", "chromium-browse"],
        (Os::Linux, Browser::Edge) => &["msedge", "microsoft-edge"],
        (Os::Linux, Browser::Opera) => &["opera"],
        (Os::Linux, Browser::Vivaldi) => &["vivaldi", "vivaldi-bin"],
        (Os::Linux, Browser::Whale) => &["whale", "naver-whale"],
        (Os::Linux, Browser::Firefox) => &["firefox", "firefox-bin", "firefox-esr"],
        (Os::Linux, Browser::Safari) => &[],
    }
}

pub(crate) fn detect_in(os: Os, env: &Env, running: &HashSet<String>) -> Vec<BrowserInfo> {
    let mut out = Vec::new();
    for b in ORDER {
        let mut installed = true;
        let profiles = match b {
            Browser::Firefox => {
                let mut all: Vec<BrowserProfile> = Vec::new();
                let mut found = false;
                for root in firefox_roots(os, env) {
                    let Ok(ini) = std::fs::read_to_string(root.join("profiles.ini")) else {
                        continue;
                    };
                    found = true;
                    for p in parse_firefox_entries(&ini) {
                        let abs = firefox_profile_path(&root, &p);
                        if abs.is_dir() && !all.iter().any(|x| Path::new(&x.id) == abs) {
                            all.push(BrowserProfile {
                                id: abs.to_string_lossy().into_owned(),
                                name: p.name,
                            });
                        }
                    }
                }
                // Listed even when absent: it is the recommended way out on Windows.
                installed = found;
                all
            }
            Browser::Safari => {
                if !safari_present(os, env) {
                    continue;
                }
                Vec::new()
            }
            _ => {
                let Some(dir) = chromium_dir(os, env, b).filter(|d| d.is_dir()) else {
                    continue;
                };
                if b == Browser::Opera {
                    Vec::new() // yt-dlp: Opera has no profile support.
                } else {
                    let mut profiles = std::fs::read_to_string(dir.join("Local State"))
                        .map(|s| parse_chromium_local_state(&s))
                        .unwrap_or_default();
                    profiles.retain(|p| dir.join(&p.id).is_dir());
                    if profiles.is_empty() && dir.join("Default").is_dir() {
                        profiles.push(BrowserProfile {
                            id: "Default".into(),
                            name: "Default".into(),
                        });
                    }
                    if profiles.is_empty() {
                        continue; // leftover data folder of an uninstalled browser
                    }
                    profiles
                }
            }
        };
        let names = process_names(os, b);
        out.push(BrowserInfo {
            browser: b,
            profiles,
            installed,
            running: names.iter().any(|n| running.contains(*n)),
        });
    }
    out
}

fn firefox_profile_path(root: &Path, p: &FirefoxProfile) -> PathBuf {
    if p.relative {
        let mut path = root.to_path_buf();
        for part in p.path.split(['/', '\\']).filter(|s| !s.is_empty()) {
            path.push(part);
        }
        path
    } else {
        PathBuf::from(&p.path)
    }
}

// ───────────────────────────── running processes ─────────────────────────────

/// Best-effort set of running process names (lower-case, basename). Empty on any failure.
fn running_processes() -> HashSet<String> {
    let output = if cfg!(windows) {
        sync_command("tasklist")
            .args(["/FO", "CSV", "/NH"])
            .output()
    } else {
        sync_command("ps").args(["-A", "-o", "comm="]).output()
    };
    match output {
        Ok(o) if o.status.success() => parse_process_list(&String::from_utf8_lossy(&o.stdout)),
        _ => HashSet::new(),
    }
}

/// `tasklist /FO CSV /NH` lines (`"brave.exe","1234",…`) or `ps -o comm=` lines (paths allowed).
fn parse_process_list(text: &str) -> HashSet<String> {
    text.lines()
        .filter_map(|l| {
            let l = l.trim();
            let name = if let Some(rest) = l.strip_prefix('"') {
                rest.split('"').next()?
            } else {
                l.rsplit('/').next()?
            };
            let name = name.trim();
            (!name.is_empty()).then(|| name.to_lowercase())
        })
        .collect()
}

fn sync_command(program: &str) -> std::process::Command {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new(program);
    cmd.stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;

    const LOCAL_STATE: &str = r#"{
      "browser": {"enabled_labs_experiments": []},
      "os_crypt": {"encrypted_key": "c3ludGhldGlj"},
      "profile": {
        "last_used": "Profile 2",
        "info_cache": {
          "Profile 10": {"name": "Trabajo ñandú", "is_using_default_name": false},
          "Profile 2": {"name": "Personal 🎵"},
          "Default": {"name": "Gerson"},
          "Guest Profile": {"name": ""}
        }
      }
    }"#;

    #[test]
    fn chromium_profiles_default_first_numeric_order() {
        let p = parse_chromium_local_state(LOCAL_STATE);
        let ids: Vec<_> = p.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, ["Default", "Profile 2", "Profile 10", "Guest Profile"]);
        assert_eq!(p[0].name, "Gerson");
        assert_eq!(p[1].name, "Personal 🎵");
        assert_eq!(p[2].name, "Trabajo ñandú");
        assert_eq!(p[3].name, "Guest Profile"); // empty name falls back to id
    }

    #[test]
    fn chromium_bad_json() {
        assert!(parse_chromium_local_state("not json").is_empty());
        assert!(parse_chromium_local_state("{}").is_empty());
        assert!(parse_chromium_local_state(r#"{"profile":{"info_cache":[]}}"#).is_empty());
    }

    const PROFILES_INI: &str = "[Profile1]\r\n\
Name=default\r\n\
IsRelative=1\r\n\
Path=Profiles/abcd1234.default\r\n\
Default=1\r\n\
\r\n\
[Profile0]\r\n\
Name=default-release\r\n\
IsRelative=1\r\n\
Path=Profiles/wxyz9876.default-release\r\n\
\r\n\
[Profile2]\r\n\
Name=Música\r\n\
IsRelative=0\r\n\
Path=/data/firefox/musica\r\n\
\r\n\
[General]\r\n\
StartWithLastProfile=1\r\n\
Version=2\r\n\
\r\n\
[Install308046B0AF4A39CB]\r\n\
Default=Profiles/wxyz9876.default-release\r\n\
Locked=1\r\n";

    #[test]
    fn firefox_install_default_then_legacy_default() {
        let p = parse_firefox_profiles_ini(PROFILES_INI);
        let ids: Vec<_> = p.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "Profiles/wxyz9876.default-release",
                "Profiles/abcd1234.default",
                "/data/firefox/musica"
            ]
        );
        assert_eq!(p[2].name, "Música");
    }

    #[test]
    fn firefox_relative_flags() {
        let e = parse_firefox_entries(PROFILES_INI);
        assert!(e[0].relative && e[1].relative && !e[2].relative);
        assert!(parse_firefox_profiles_ini("garbage").is_empty());
        assert!(parse_firefox_profiles_ini("[Profile0]\nName=x\n").is_empty());
    }

    #[test]
    fn process_list_parsing() {
        let win = "\"System Idle Process\",\"0\",\"Services\",\"0\",\"8 K\"\r\n\"brave.exe\",\"15268\",\"Console\",\"1\",\"473.792 KB\"\r\n";
        let s = parse_process_list(win);
        assert!(s.contains("brave.exe"));
        let unix = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser\nfirefox-bin\n";
        let s = parse_process_list(unix);
        assert!(s.contains("brave browser") && s.contains("firefox-bin"));
    }

    fn mkdirs(paths: &[PathBuf]) {
        for p in paths {
            std::fs::create_dir_all(p).unwrap();
        }
    }

    #[test]
    fn detect_layouts_all_os() {
        for os in [Os::Windows, Os::Mac, Os::Linux] {
            let t = tempfile::tempdir().unwrap();
            let home = t.path().join("home");
            let env = Env {
                home: Some(home.clone()),
                local_appdata: Some(t.path().join("local")),
                appdata: Some(t.path().join("roaming")),
                xdg_config: Some(home.join(".config")),
            };
            // Brave with two profiles (+ one stale entry without a directory).
            let brave = chromium_dir(os, &env, Browser::Brave).unwrap();
            mkdirs(&[brave.join("Default"), brave.join("Profile 2")]);
            std::fs::write(brave.join("Local State"), LOCAL_STATE).unwrap();
            // Edge without Local State but with a Default dir.
            let edge = chromium_dir(os, &env, Browser::Edge).unwrap();
            mkdirs(&[edge.join("Default")]);
            // Opera: no profiles.
            mkdirs(&[chromium_dir(os, &env, Browser::Opera).unwrap()]);
            // Firefox in the first root.
            let ff = firefox_roots(os, &env).remove(0);
            mkdirs(&[
                ff.join("Profiles").join("wxyz9876.default-release"),
                ff.join("Profiles").join("abcd1234.default"),
            ]);
            std::fs::write(ff.join("profiles.ini"), PROFILES_INI).unwrap();
            if os == Os::Mac {
                mkdirs(&[home.join("Library/Safari")]);
            }

            let running: HashSet<String> = process_names(os, Browser::Brave)
                .iter()
                .map(|s| s.to_string())
                .collect();
            let found = detect_in(os, &env, &running);
            let browsers: Vec<_> = found.iter().map(|b| b.browser).collect();
            let mut want = vec![
                Browser::Brave,
                Browser::Edge,
                Browser::Firefox,
                Browser::Opera,
            ];
            if os == Os::Mac {
                want.push(Browser::Safari);
            }
            assert_eq!(browsers, want, "{os:?}");

            let b = &found[0];
            assert!(b.running);
            assert_eq!(
                b.profiles.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(),
                ["Default", "Profile 2"]
            );
            assert_eq!(found[1].profiles[0].id, "Default");
            assert!(!found[1].running);
            let f = &found[2];
            assert_eq!(f.profiles.len(), 2, "absolute /data path does not exist");
            assert_eq!(f.profiles[0].name, "default-release");
            assert!(Path::new(&f.profiles[0].id).is_absolute());
            assert!(Path::new(&f.profiles[0].id).is_dir());
            assert!(found[3].profiles.is_empty());
        }
    }

    #[test]
    fn detect_nothing_installed() {
        let t = tempfile::tempdir().unwrap();
        let env = Env {
            home: Some(t.path().into()),
            local_appdata: Some(t.path().into()),
            appdata: Some(t.path().into()),
            xdg_config: Some(t.path().into()),
        };
        for os in [Os::Windows, Os::Mac, Os::Linux] {
            // Only Firefox is listed, as not installed, so the UI can recommend it.
            let found = detect_in(os, &env, &HashSet::new());
            assert_eq!(found.len(), 1, "{os:?}");
            assert_eq!(found[0].browser, Browser::Firefox);
            assert!(!found[0].installed);
            assert!(found[0].profiles.is_empty());
        }
    }

    #[test]
    fn chromium_data_dir_without_profiles_is_not_listed() {
        // e.g. an uninstalled Chrome that left `User Data` behind without `Local State`.
        let t = tempfile::tempdir().unwrap();
        let env = Env {
            home: Some(t.path().into()),
            local_appdata: Some(t.path().into()),
            appdata: Some(t.path().into()),
            xdg_config: Some(t.path().into()),
        };
        let dir = chromium_dir(Os::Windows, &env, Browser::Chrome).unwrap();
        std::fs::create_dir_all(&dir).unwrap();
        let found = detect_in(Os::Windows, &env, &HashSet::new());
        assert!(found.iter().all(|b| b.browser != Browser::Chrome));
    }

    #[test]
    fn detect_real_machine_does_not_panic() {
        let _ = detect();
    }
}
