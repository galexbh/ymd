//! Filesystem layout. Owner: deps agent (A).
//!
//! - bin dir: Windows `%LOCALAPPDATA%\ymd\bin` (falls back to `<data dir>/bin`),
//!   macOS `~/Library/Application Support/<id>/bin`, Linux `$XDG_DATA_HOME/<id>/bin`;
//!   overridable from settings.
//! - data dir: history db, download archive, auth/cookies.txt, tmp.
//! - config dir: settings.json.

use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub bin_dir: PathBuf,
    pub data_dir: PathBuf,
    pub config_dir: PathBuf,
}

impl AppPaths {
    /// Build from explicit roots (used by tests and by `from_app`).
    pub fn new(data_dir: PathBuf, config_dir: PathBuf, bin_override: Option<&str>) -> Self {
        let bin_dir = match bin_override.map(str::trim).filter(|s| !s.is_empty()) {
            Some(custom) => PathBuf::from(custom),
            None => default_bin_dir(&data_dir),
        };
        Self {
            bin_dir,
            data_dir,
            config_dir,
        }
    }

    /// Resolve from the Tauri path resolver.
    pub fn from_app(app: &tauri::AppHandle, bin_override: Option<&str>) -> anyhow::Result<Self> {
        use tauri::Manager;
        let resolver = app.path();
        let data_dir = resolver.app_data_dir()?;
        let config_dir = resolver.app_config_dir()?;
        Ok(Self::new(data_dir, config_dir, bin_override))
    }

    pub fn settings_file(&self) -> PathBuf {
        self.config_dir.join("settings.json")
    }
    pub fn history_db(&self) -> PathBuf {
        self.data_dir.join("history.sqlite3")
    }
    pub fn archive_file(&self) -> PathBuf {
        self.data_dir.join("download-archive.txt")
    }
    pub fn auth_dir(&self) -> PathBuf {
        self.data_dir.join("auth")
    }
    pub fn cookies_file(&self) -> PathBuf {
        self.auth_dir().join("cookies.txt")
    }
    pub fn tmp_dir(&self) -> PathBuf {
        self.data_dir.join("tmp")
    }
    /// Executable path for a managed tool inside the bin dir (adds `.exe` on Windows).
    pub fn bin(&self, name: &str) -> PathBuf {
        self.bin_dir.join(exe_name(name))
    }
}

/// Platform default bin dir. On Windows this is `%LOCALAPPDATA%\ymd\bin`.
pub fn default_bin_dir(data_dir: &Path) -> PathBuf {
    bin_dir_for(cfg!(windows), std::env::var_os("LOCALAPPDATA"), data_dir)
}

/// Pure form of [`default_bin_dir`] so every platform's rule is testable on any host.
pub(crate) fn bin_dir_for(
    windows: bool,
    local_app_data: Option<std::ffi::OsString>,
    data_dir: &Path,
) -> PathBuf {
    if windows {
        if let Some(base) = local_app_data.filter(|v| !v.is_empty()) {
            return PathBuf::from(base).join("ymd").join("bin");
        }
    }
    data_dir.join("bin")
}

pub fn exe_name(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_uses_localappdata() {
        let data = Path::new("/data/com.ymd.app");
        let dir = bin_dir_for(true, Some(r"C:\Users\me\AppData\Local".into()), data);
        assert_eq!(
            dir,
            PathBuf::from(r"C:\Users\me\AppData\Local")
                .join("ymd")
                .join("bin")
        );
    }

    #[test]
    fn windows_without_localappdata_falls_back_to_data_dir() {
        let data = Path::new("/data/com.ymd.app");
        assert_eq!(bin_dir_for(true, None, data), data.join("bin"));
        assert_eq!(bin_dir_for(true, Some("".into()), data), data.join("bin"));
    }

    #[test]
    fn unix_uses_data_dir_even_if_localappdata_is_set() {
        let data = Path::new("/home/me/.local/share/com.ymd.app");
        assert_eq!(
            bin_dir_for(false, Some("/ignored".into()), data),
            data.join("bin")
        );
    }

    #[test]
    fn default_bin_dir_matches_platform_rule() {
        let data = Path::new("data-root");
        let expected = bin_dir_for(cfg!(windows), std::env::var_os("LOCALAPPDATA"), data);
        assert_eq!(default_bin_dir(data), expected);
        if cfg!(windows) {
            if let Some(lad) = std::env::var_os("LOCALAPPDATA") {
                assert_eq!(
                    default_bin_dir(data),
                    PathBuf::from(lad).join("ymd").join("bin")
                );
            }
        } else {
            assert_eq!(default_bin_dir(data), data.join("bin"));
        }
    }

    #[test]
    fn override_wins_and_blank_override_is_ignored() {
        let p = AppPaths::new("d".into(), "c".into(), Some("  custom/bin "));
        assert_eq!(p.bin_dir, PathBuf::from("custom/bin"));
        let p = AppPaths::new("d".into(), "c".into(), Some("   "));
        assert_eq!(p.bin_dir, default_bin_dir(Path::new("d")));
        let p = AppPaths::new("d".into(), "c".into(), None);
        assert_eq!(p.bin_dir, default_bin_dir(Path::new("d")));
    }

    #[test]
    fn derived_paths() {
        let p = AppPaths::new("d".into(), "c".into(), Some("b"));
        assert_eq!(p.settings_file(), Path::new("c").join("settings.json"));
        assert_eq!(
            p.cookies_file(),
            Path::new("d").join("auth").join("cookies.txt")
        );
        assert_eq!(p.bin("yt-dlp"), Path::new("b").join(exe_name("yt-dlp")));
        assert_eq!(exe_name("x").ends_with(".exe"), cfg!(windows));
    }
}
