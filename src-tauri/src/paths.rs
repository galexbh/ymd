//! Filesystem layout. Owner: deps agent (A).
//!
//! - bin dir: Windows `%LOCALAPPDATA%\ymd\bin`, macOS `~/Library/Application Support/<id>/bin`,
//!   Linux `$XDG_DATA_HOME/<id>/bin`; overridable from settings.
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
        let _ = (&data_dir, &config_dir, bin_override);
        todo!("A: resolve bin_dir = override or default_bin_dir(&data_dir)")
    }

    /// Resolve from the Tauri path resolver.
    pub fn from_app(app: &tauri::AppHandle, bin_override: Option<&str>) -> anyhow::Result<Self> {
        let _ = (app, bin_override);
        todo!("A")
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
    let _ = data_dir;
    todo!("A")
}

pub fn exe_name(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}
