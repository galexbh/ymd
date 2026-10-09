//! `bin_dir/.ymd-manifest.json`: what ymd installed (tag, revision, verified) per dep, so
//! updates compare release identities instead of guessing from `--version`. Holds nothing
//! secret. Owner: A.

use crate::model::DepId;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const FILE_NAME: &str = ".ymd-manifest.json";

/// Serializes read-modify-write cycles across concurrent installs in this process.
static LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    /// Release tag (`2026.08.19`, `v2.9.7`, `latest`).
    pub tag: String,
    /// Identity compared for updates (tag, or `tag@<asset upload time>` for rolling tags).
    pub revision: String,
    pub asset: String,
    pub verified: bool,
    pub installed_at: String,
    /// File names written into the bin dir.
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Manifest {
    #[serde(default)]
    pub version: u32,
    #[serde(default)]
    pub deps: BTreeMap<String, Entry>,
}

pub fn key(id: DepId) -> &'static str {
    match id {
        DepId::Ytdlp => "ytdlp",
        DepId::Ffmpeg => "ffmpeg",
        DepId::Deno => "deno",
        DepId::Aria2c => "aria2c",
        DepId::Atomicparsley => "atomicparsley",
    }
}

pub fn path(bin_dir: &Path) -> PathBuf {
    bin_dir.join(FILE_NAME)
}

impl Manifest {
    /// Missing or corrupt manifests read as empty: the binaries themselves are the truth.
    pub fn load(bin_dir: &Path) -> Self {
        std::fs::read(path(bin_dir))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, bin_dir: &Path) -> anyhow::Result<()> {
        std::fs::create_dir_all(bin_dir)?;
        let tmp = bin_dir.join(format!("{FILE_NAME}.tmp"));
        std::fs::write(&tmp, serde_json::to_vec_pretty(self)?)?;
        std::fs::rename(&tmp, path(bin_dir))?;
        Ok(())
    }

    pub fn get(&self, id: DepId) -> Option<&Entry> {
        self.deps.get(key(id))
    }
}

/// Load, apply `f`, save — under the process-wide manifest lock.
pub fn update(bin_dir: &Path, f: impl FnOnce(&mut Manifest)) -> anyhow::Result<()> {
    let _guard = LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let mut m = Manifest::load(bin_dir);
    m.version = 1;
    f(&mut m);
    m.save(bin_dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(tag: &str) -> Entry {
        Entry {
            tag: tag.into(),
            revision: tag.into(),
            asset: "yt-dlp.exe".into(),
            verified: true,
            installed_at: "2026-10-09T00:00:00Z".into(),
            files: vec!["yt-dlp.exe".into()],
        }
    }

    #[test]
    fn round_trip_and_update() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(Manifest::load(dir.path()), Manifest::default());
        update(dir.path(), |m| {
            m.deps.insert(key(DepId::Ytdlp).into(), entry("2026.08.19"));
        })
        .unwrap();
        update(dir.path(), |m| {
            m.deps.insert(key(DepId::Deno).into(), entry("v2.9.7"));
        })
        .unwrap();
        let m = Manifest::load(dir.path());
        assert_eq!(m.version, 1);
        assert_eq!(m.get(DepId::Ytdlp), Some(&entry("2026.08.19")));
        assert_eq!(m.get(DepId::Deno).unwrap().tag, "v2.9.7");
        assert_eq!(m.get(DepId::Ffmpeg), None);
        let text = std::fs::read_to_string(path(dir.path())).unwrap();
        assert!(text.contains("\"installedAt\""), "{text}");
    }

    #[test]
    fn corrupt_manifest_reads_empty() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(path(dir.path()), b"{not json").unwrap();
        assert_eq!(Manifest::load(dir.path()), Manifest::default());
    }

    #[test]
    fn keys_match_ipc_tags() {
        for id in DepId::ALL {
            assert_eq!(serde_json::to_value(id).unwrap(), key(id));
        }
    }
}
