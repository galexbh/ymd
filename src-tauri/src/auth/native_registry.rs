//! Registers ymd as the `com.ymd.cookies` native-messaging host for Chromium browsers.
//!
//! - Windows: `HKCU\Software\<vendor>\NativeMessagingHosts\com.ymd.cookies` (default value =
//!   path of the host manifest JSON). HKCU needs no elevation.
//! - macOS / Linux: the manifest JSON is copied into each browser's `NativeMessagingHosts` dir.
//!
//! [`register`] runs on every launch (idempotent) so the manifest always points at the current
//! executable, also after an update moves it. Only browsers whose user-data dir exists are
//! registered. The NSIS uninstall hook (`windows/hooks.nsh`) removes the keys.
//!
//! The Chrome Web Store "external extension" registration is prepared but off
//! ([`STORE_EXTENSION_ENABLED`]).

use super::browsers::{chromium_dir, Env, Os};
use super::native_host::{allowed_origin, EXTENSION_ID, HOST_NAME};
use crate::model::{BridgeTarget, Browser};
use std::path::{Path, PathBuf};

/// Browsers ymd registers the host for, in UI order.
pub const BROWSERS: [Browser; 5] = [
    Browser::Brave,
    Browser::Chrome,
    Browser::Edge,
    Browser::Chromium,
    Browser::Vivaldi,
];

/// Writes the Web Store external-extension keys at install time when true. Off until the
/// extension is published (and Edge's acceptance of a Chrome Web Store `update_url` verified).
pub const STORE_EXTENSION_ENABLED: bool = false;
/// Chrome Web Store update endpoint used by external-extension registrations.
pub const STORE_UPDATE_URL: &str = "https://clients2.google.com/service/update2/crx";

/// Windows registry vendor path (under `HKCU\Software`).
fn vendor_key(b: Browser) -> Option<&'static str> {
    Some(match b {
        Browser::Brave => r"BraveSoftware\Brave-Browser",
        Browser::Chrome => r"Google\Chrome",
        Browser::Edge => r"Microsoft\Edge",
        Browser::Chromium => "Chromium",
        Browser::Vivaldi => "Vivaldi",
        _ => return None,
    })
}

/// Pure: the host manifest Chromium reads.
pub fn host_manifest_json(exe_path: &Path) -> String {
    host_manifest_json_named(HOST_NAME, exe_path)
}

fn host_manifest_json_named(name: &str, exe_path: &Path) -> String {
    let v = serde_json::json!({
        "name": name,
        "description": "ymd cookie bridge",
        "path": exe_path.to_string_lossy(),
        "type": "stdio",
        "allowed_origins": [allowed_origin()],
    });
    serde_json::to_string_pretty(&v).expect("static JSON") + "\n"
}

/// Pure (Windows): HKCU subkeys holding the host registration, one per browser.
pub fn registry_targets() -> Vec<(Browser, String)> {
    registry_targets_named(HOST_NAME)
}

fn registry_targets_named(name: &str) -> Vec<(Browser, String)> {
    BROWSERS
        .iter()
        .filter_map(|b| {
            vendor_key(*b).map(|v| (*b, format!(r"Software\{v}\NativeMessagingHosts\{name}")))
        })
        .collect()
}

/// Pure (macOS / Linux): each browser's `NativeMessagingHosts` dir for a `home` with default
/// XDG dirs. Empty on Windows. ([`register`] uses the process env, which honours
/// `$XDG_CONFIG_HOME`.)
#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn manifest_dirs(os: Os, home: &Path) -> Vec<(Browser, PathBuf)> {
    let env = Env {
        home: Some(home.to_path_buf()),
        xdg_config: Some(home.join(".config")),
        ..Env::default()
    };
    manifest_dirs_in(os, &env)
}

fn manifest_dirs_in(os: Os, env: &Env) -> Vec<(Browser, PathBuf)> {
    if os == Os::Windows {
        return Vec::new();
    }
    BROWSERS
        .iter()
        .filter_map(|b| chromium_dir(os, env, *b).map(|d| (*b, d.join("NativeMessagingHosts"))))
        .collect()
}

/// One `HKCU\...\Extensions\<id>` entry for the Web Store external-extension install.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExternalExtensionKey {
    pub browser: Browser,
    pub key: String,
    pub value_name: &'static str,
    pub value: &'static str,
}

/// Pure (Windows): keys that make Chrome / Brave / Edge offer the Web Store extension.
pub fn external_extension_keys() -> Vec<ExternalExtensionKey> {
    [Browser::Chrome, Browser::Brave, Browser::Edge]
        .iter()
        .filter_map(|b| {
            vendor_key(*b).map(|v| ExternalExtensionKey {
                browser: *b,
                key: format!(r"Software\{v}\Extensions\{EXTENSION_ID}"),
                value_name: "update_url",
                value: STORE_UPDATE_URL,
            })
        })
        .collect()
}

/// Where ymd keeps its own copy of the host manifest.
pub fn manifest_path(app_data_dir: &Path) -> PathBuf {
    manifest_path_named(HOST_NAME, app_data_dir)
}

fn manifest_path_named(name: &str, app_data_dir: &Path) -> PathBuf {
    app_data_dir
        .join("native-messaging")
        .join(format!("{name}.json"))
}

fn installed(os: Os, env: &Env, b: Browser) -> bool {
    chromium_dir(os, env, b).is_some_and(|d| d.is_dir())
}

/// Register the host for every installed browser. Idempotent; per-browser failures are logged
/// and reported as `registered: false`.
pub fn register(app_data_dir: &Path, exe: &Path) -> Vec<BridgeTarget> {
    register_named(
        HOST_NAME,
        app_data_dir,
        exe,
        Os::current(),
        &Env::from_process(),
    )
}

/// Remove every registration ymd may have written (all browsers, installed or not).
pub fn unregister(app_data_dir: &Path) {
    unregister_named(HOST_NAME, app_data_dir, Os::current(), &Env::from_process())
}

/// Current state without writing anything.
pub fn status(app_data_dir: &Path) -> Vec<BridgeTarget> {
    status_named(HOST_NAME, app_data_dir, Os::current(), &Env::from_process())
}

fn write_if_changed(path: &Path, content: &str) -> std::io::Result<()> {
    if std::fs::read_to_string(path).is_ok_and(|c| c == content) {
        return Ok(());
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(path, content)
}

fn register_named(
    name: &str,
    app_data_dir: &Path,
    exe: &Path,
    os: Os,
    env: &Env,
) -> Vec<BridgeTarget> {
    let manifest = host_manifest_json_named(name, exe);
    let own = manifest_path_named(name, app_data_dir);
    let own_ok = match write_if_changed(&own, &manifest) {
        Ok(()) => true,
        Err(e) => {
            log::warn!("cookie bridge: cannot write {}: {e}", own.display());
            false
        }
    };
    BROWSERS
        .iter()
        .map(|&browser| {
            let installed = installed(os, env, browser);
            // On Windows, Chromium forks without their own documented key (Opera, Arc, Yandex,
            // Whale, Thorium…) fall back to Chrome's and Chromium's, so those two are always
            // written, installed or not.
            let fallback =
                os == Os::Windows && matches!(browser, Browser::Chrome | Browser::Chromium);
            let registered = (installed || fallback)
                && own_ok
                && match register_one(name, browser, &own, &manifest, os, env) {
                    Ok(()) => true,
                    Err(e) => {
                        log::warn!("cookie bridge: cannot register for {browser:?}: {e}");
                        false
                    }
                };
            BridgeTarget {
                browser,
                installed,
                registered: registered || is_registered(name, browser, &own, os, env),
            }
        })
        .collect()
}

fn status_named(name: &str, app_data_dir: &Path, os: Os, env: &Env) -> Vec<BridgeTarget> {
    let own = manifest_path_named(name, app_data_dir);
    BROWSERS
        .iter()
        .map(|&browser| BridgeTarget {
            browser,
            installed: installed(os, env, browser),
            registered: is_registered(name, browser, &own, os, env),
        })
        .collect()
}

fn unix_manifest_file(name: &str, browser: Browser, os: Os, env: &Env) -> Option<PathBuf> {
    manifest_dirs_in(os, env)
        .into_iter()
        .find(|(b, _)| *b == browser)
        .map(|(_, d)| d.join(format!("{name}.json")))
}

fn register_one(
    name: &str,
    browser: Browser,
    own: &Path,
    manifest: &str,
    os: Os,
    env: &Env,
) -> std::io::Result<()> {
    if os == Os::Windows {
        return win::set_default(&registry_key(name, browser)?, &own.to_string_lossy());
    }
    let file = unix_manifest_file(name, browser, os, env)
        .ok_or_else(|| std::io::Error::other("no manifest dir"))?;
    write_if_changed(&file, manifest)
}

fn registry_key(name: &str, browser: Browser) -> std::io::Result<String> {
    registry_targets_named(name)
        .into_iter()
        .find(|(b, _)| *b == browser)
        .map(|(_, k)| k)
        .ok_or_else(|| std::io::Error::other("unsupported browser"))
}

fn is_registered(name: &str, browser: Browser, own: &Path, os: Os, env: &Env) -> bool {
    if os == Os::Windows {
        let Ok(key) = registry_key(name, browser) else {
            return false;
        };
        return own.is_file() && win::get_default(&key).is_some_and(|v| Path::new(&v) == own);
    }
    unix_manifest_file(name, browser, os, env).is_some_and(|f| f.is_file())
}

fn unregister_named(name: &str, app_data_dir: &Path, os: Os, env: &Env) {
    for browser in BROWSERS {
        if os == Os::Windows {
            if let Ok(key) = registry_key(name, browser) {
                if let Err(e) = win::delete(&key) {
                    log::warn!("cookie bridge: cannot remove {key}: {e}");
                }
            }
        } else if let Some(f) = unix_manifest_file(name, browser, os, env) {
            let _ = std::fs::remove_file(f);
        }
    }
    let _ = std::fs::remove_file(manifest_path_named(name, app_data_dir));
}

#[cfg(windows)]
mod win {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    pub fn set_default(key: &str, value: &str) -> std::io::Result<()> {
        let (k, _) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(key)?;
        if k.get_value::<String, _>("").is_ok_and(|v| v == value) {
            return Ok(());
        }
        k.set_value("", &value)
    }

    pub fn get_default(key: &str) -> Option<String> {
        RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(key)
            .and_then(|k| k.get_value::<String, _>(""))
            .ok()
    }

    pub fn delete(key: &str) -> std::io::Result<()> {
        match RegKey::predef(HKEY_CURRENT_USER).delete_subkey_all(key) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            r => r,
        }
    }
}

#[cfg(not(windows))]
mod win {
    fn unsupported() -> std::io::Error {
        std::io::Error::other("the Windows registry is not available on this OS")
    }
    pub fn set_default(_key: &str, _value: &str) -> std::io::Result<()> {
        Err(unsupported())
    }
    pub fn get_default(_key: &str) -> Option<String> {
        None
    }
    pub fn delete(_key: &str) -> std::io::Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_json() {
        let exe = if cfg!(windows) {
            PathBuf::from(r"C:\Users\u\AppData\Local\ymd\ymd.exe")
        } else {
            PathBuf::from("/opt/ymd/ymd")
        };
        let v: serde_json::Value = serde_json::from_str(&host_manifest_json(&exe)).unwrap();
        assert_eq!(
            v,
            serde_json::json!({
                "name": "com.ymd.cookies",
                "description": "ymd cookie bridge",
                "path": exe.to_string_lossy(),
                "type": "stdio",
                "allowed_origins": ["chrome-extension://gicaphbpepkphmeciigjhdpnbcaflfgd/"],
            })
        );
        assert!(host_manifest_json(&exe).ends_with("}\n"));
    }

    #[test]
    fn windows_registry_targets() {
        let keys: Vec<String> = registry_targets().into_iter().map(|(_, k)| k).collect();
        assert_eq!(
            keys,
            [
                r"Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.ymd.cookies",
                r"Software\Google\Chrome\NativeMessagingHosts\com.ymd.cookies",
                r"Software\Microsoft\Edge\NativeMessagingHosts\com.ymd.cookies",
                r"Software\Chromium\NativeMessagingHosts\com.ymd.cookies",
                r"Software\Vivaldi\NativeMessagingHosts\com.ymd.cookies",
            ]
        );
    }

    #[test]
    fn manifest_dirs_per_os() {
        let home = Path::new("/home/u");
        assert!(manifest_dirs(Os::Windows, home).is_empty());
        let rel = |os| {
            manifest_dirs(os, home)
                .into_iter()
                .map(|(b, d)| {
                    let rel = d
                        .strip_prefix(home)
                        .unwrap()
                        .to_string_lossy()
                        .replace('\\', "/");
                    (b, rel)
                })
                .collect::<Vec<_>>()
        };
        let s = |b, p: &str| (b, p.to_string());
        assert_eq!(
            rel(Os::Mac),
            [
                s(
                    Browser::Brave,
                    "Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
                ),
                s(
                    Browser::Chrome,
                    "Library/Application Support/Google/Chrome/NativeMessagingHosts"
                ),
                s(
                    Browser::Edge,
                    "Library/Application Support/Microsoft Edge/NativeMessagingHosts"
                ),
                s(
                    Browser::Chromium,
                    "Library/Application Support/Chromium/NativeMessagingHosts"
                ),
                s(
                    Browser::Vivaldi,
                    "Library/Application Support/Vivaldi/NativeMessagingHosts"
                ),
            ]
        );
        assert_eq!(
            rel(Os::Linux),
            [
                s(
                    Browser::Brave,
                    ".config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
                ),
                s(
                    Browser::Chrome,
                    ".config/google-chrome/NativeMessagingHosts"
                ),
                s(Browser::Edge, ".config/microsoft-edge/NativeMessagingHosts"),
                s(Browser::Chromium, ".config/chromium/NativeMessagingHosts"),
                s(Browser::Vivaldi, ".config/vivaldi/NativeMessagingHosts"),
            ]
        );
    }

    #[test]
    fn external_keys() {
        const { assert!(!STORE_EXTENSION_ENABLED) };
        let keys = external_extension_keys();
        assert_eq!(
            keys.iter().map(|k| k.key.as_str()).collect::<Vec<_>>(),
            [
                r"Software\Google\Chrome\Extensions\gicaphbpepkphmeciigjhdpnbcaflfgd",
                r"Software\BraveSoftware\Brave-Browser\Extensions\gicaphbpepkphmeciigjhdpnbcaflfgd",
                r"Software\Microsoft\Edge\Extensions\gicaphbpepkphmeciigjhdpnbcaflfgd",
            ]
        );
        for k in keys {
            assert_eq!(k.value_name, "update_url");
            assert_eq!(k.value, "https://clients2.google.com/service/update2/crx");
        }
    }

    /// The NSIS hooks must name exactly the keys the app writes.
    #[test]
    fn nsis_hooks_cover_every_key() {
        let nsh = std::fs::read_to_string(
            Path::new(env!("CARGO_MANIFEST_DIR")).join("windows/hooks.nsh"),
        )
        .unwrap();
        let (post, pre) = nsh
            .split_once("!macro NSIS_HOOK_PREUNINSTALL")
            .expect("PREUNINSTALL macro");
        assert!(post.contains("!macro NSIS_HOOK_POSTINSTALL"));
        assert!(post.contains("!ifdef YMD_STORE_EXTENSION"));
        for (_, key) in registry_targets() {
            assert!(
                pre.contains(&format!(r#"DeleteRegKey HKCU "{key}""#)),
                "{key}"
            );
        }
        for k in external_extension_keys() {
            assert!(
                pre.contains(&format!(r#"DeleteRegKey HKCU "{}""#, k.key)),
                "{}",
                k.key
            );
            assert!(
                post.contains(&format!(
                    r#"WriteRegStr HKCU "{}" "{}" "{}""#,
                    k.key, k.value_name, k.value
                )),
                "{}",
                k.key
            );
        }
    }

    fn fake_env(root: &Path) -> Env {
        Env {
            home: Some(root.join("home")),
            local_appdata: Some(root.join("local")),
            appdata: Some(root.join("roaming")),
            xdg_config: Some(root.join("home/.config")),
        }
    }

    #[test]
    fn unix_register_and_unregister() {
        for os in [Os::Mac, Os::Linux] {
            let root = tempfile::tempdir().unwrap();
            let env = fake_env(root.path());
            let data = root.path().join("data");
            // Only Brave and Vivaldi are "installed".
            for b in [Browser::Brave, Browser::Vivaldi] {
                std::fs::create_dir_all(chromium_dir(os, &env, b).unwrap()).unwrap();
            }
            let exe = Path::new("/opt/ymd/ymd");
            let targets = register_named("com.ymd.test", &data, exe, os, &env);
            let got: Vec<(Browser, bool, bool)> = targets
                .iter()
                .map(|t| (t.browser, t.installed, t.registered))
                .collect();
            assert_eq!(
                got,
                [
                    (Browser::Brave, true, true),
                    (Browser::Chrome, false, false),
                    (Browser::Edge, false, false),
                    (Browser::Chromium, false, false),
                    (Browser::Vivaldi, true, true),
                ],
                "{os:?}"
            );
            let file = unix_manifest_file("com.ymd.test", Browser::Brave, os, &env).unwrap();
            let want = host_manifest_json_named("com.ymd.test", exe);
            assert_eq!(std::fs::read_to_string(&file).unwrap(), want);
            assert_eq!(
                std::fs::read_to_string(manifest_path_named("com.ymd.test", &data)).unwrap(),
                want
            );
            // Idempotent.
            let again = register_named("com.ymd.test", &data, exe, os, &env);
            assert_eq!(again.iter().filter(|t| t.registered).count(), 2, "{os:?}");
            assert_eq!(
                status_named("com.ymd.test", &data, os, &env)
                    .iter()
                    .filter(|t| t.registered)
                    .count(),
                2
            );
            unregister_named("com.ymd.test", &data, os, &env);
            assert!(!file.exists());
            assert!(!manifest_path_named("com.ymd.test", &data).exists());
            assert!(status_named("com.ymd.test", &data, os, &env)
                .iter()
                .all(|t| !t.registered));
        }
    }

    /// Writes real HKCU keys under a test-only host name, then removes them.
    #[cfg(windows)]
    #[test]
    #[ignore = "writes to HKCU; run manually on Windows"]
    fn windows_register_and_unregister_hkcu() {
        const NAME: &str = "com.ymd.cookies.test";
        let root = tempfile::tempdir().unwrap();
        let env = fake_env(root.path());
        for b in BROWSERS {
            std::fs::create_dir_all(chromium_dir(Os::Windows, &env, b).unwrap()).unwrap();
        }
        let data = root.path().join("data");
        let exe = Path::new(r"C:\ymd\ymd.exe");
        let targets = register_named(NAME, &data, exe, Os::Windows, &env);
        assert!(
            targets.iter().all(|t| t.installed && t.registered),
            "{targets:?}"
        );
        let own = manifest_path_named(NAME, &data);
        for (_, key) in registry_targets_named(NAME) {
            assert_eq!(
                win::get_default(&key).as_deref(),
                Some(own.to_string_lossy().as_ref()),
                "{key}"
            );
        }
        unregister_named(NAME, &data, Os::Windows, &env);
        for (_, key) in registry_targets_named(NAME) {
            assert!(win::get_default(&key).is_none(), "{key}");
        }
        assert!(status_named(NAME, &data, Os::Windows, &env)
            .iter()
            .all(|t| !t.registered));
    }
}
