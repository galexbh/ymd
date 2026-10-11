//! Node.js LTS resolution from nodejs.org (`/dist/index.json`). Owner: A.
//!
//! nodejs.org has no releases API like GitHub's, so the latest LTS is turned into a
//! [`Release`] with two assets (the platform archive and `SHASUMS256.txt`) and the rest of the
//! install pipeline (download, SHA-256 verification, extraction, swap) stays the same.
//!
//! - Index: `<dist>/index.json`, newest first; LTS entries have `"lts": "<codename>"`, the
//!   others `"lts": false`. yt-dlp's EJS needs Node >= 22 ([`MIN_MAJOR`]).
//! - Archives: `<dist>/v{V}/node-v{V}-{win-x64.zip,darwin-arm64.tar.gz,linux-x64.tar.xz,…}`.
//! - Checksums: `<dist>/v{V}/SHASUMS256.txt` (`<hex>  <file name>` lines).

use super::catalog::Source;
use super::github::{Asset, Release};
use super::version;
use anyhow::{anyhow, bail, Context};
use serde::Deserialize;

pub const NODE_DIST: &str = "https://nodejs.org/dist";
/// Display name used as the catalog `repo` for Node sources.
pub const NODE_HOST: &str = "nodejs.org";
pub const SUMS_FILE: &str = "SHASUMS256.txt";
/// Oldest Node major yt-dlp's EJS accepts (see `jsruntime::NODE_MIN`).
pub const MIN_MAJOR: u64 = 22;

#[derive(Debug, Clone, Deserialize)]
pub struct IndexEntry {
    pub version: String,
    #[serde(default)]
    pub date: Option<String>,
    /// `false` or the LTS codename (`"Krypton"`).
    #[serde(default)]
    pub lts: serde_json::Value,
    /// Build identifiers (`win-x64-zip`, `osx-arm64-tar`, `linux-x64`, …).
    #[serde(default)]
    pub files: Vec<String>,
}

impl IndexEntry {
    fn is_lts(&self) -> bool {
        !matches!(
            self.lts,
            serde_json::Value::Bool(false) | serde_json::Value::Null
        )
    }
}

/// `index.json` build identifier for an archive name pattern (`node-*-win-x64.zip` →
/// `win-x64-zip`), so releases that lack this platform's build are skipped.
pub fn files_key(asset_pattern: &str) -> Option<String> {
    let plat = asset_pattern.strip_prefix("node-*-")?;
    if let Some(p) = plat.strip_suffix(".zip") {
        return Some(format!("{p}-zip"));
    }
    if let Some(p) = plat.strip_suffix(".tar.gz") {
        return Some(match p.strip_prefix("darwin-") {
            Some(arch) => format!("osx-{arch}-tar"),
            None => p.to_string(),
        });
    }
    plat.strip_suffix(".tar.xz")
        .map(|p| match p.strip_prefix("darwin-") {
            Some(arch) => format!("osx-{arch}-tar"),
            None => p.to_string(),
        })
}

/// Newest LTS release with major >= [`MIN_MAJOR`] that ships `files_key` (when given).
pub fn pick_lts<'a>(entries: &'a [IndexEntry], files_key: Option<&str>) -> Option<&'a IndexEntry> {
    entries
        .iter()
        .filter(|e| e.is_lts())
        .filter(|e| {
            version::numbers(&e.version)
                .first()
                .is_some_and(|m| *m >= MIN_MAJOR)
        })
        .filter(|e| match files_key {
            Some(k) if !e.files.is_empty() => e.files.iter().any(|f| f == k),
            _ => true,
        })
        .max_by(|a, b| version::numbers(&a.version).cmp(&version::numbers(&b.version)))
}

/// The archive file name for `version` (`v24.21.0`) from the catalog pattern.
pub fn asset_name(source: &Source, version: &str) -> String {
    source.asset.replacen('*', version, 1)
}

/// A GitHub-shaped release for `entry`: tag = `vX.Y.Z`, assets = archive + `SHASUMS256.txt`.
pub fn release_for(entry: &IndexEntry, dist_base: &str, source: &Source) -> Release {
    let base = dist_base.trim_end_matches('/');
    let v = &entry.version;
    let asset = |name: String| Asset {
        browser_download_url: format!("{base}/{v}/{name}"),
        name,
        size: 0,
        updated_at: None,
        digest: None,
    };
    Release {
        tag_name: v.clone(),
        published_at: entry.date.clone(),
        assets: vec![asset(asset_name(source, v)), asset(SUMS_FILE.to_string())],
    }
}

pub fn index_url(dist_base: &str) -> String {
    format!("{}/index.json", dist_base.trim_end_matches('/'))
}

/// Latest Node LTS for `source`'s platform, as a [`Release`].
pub async fn fetch_latest_lts(
    http: &reqwest::Client,
    dist_base: &str,
    source: &Source,
) -> anyhow::Result<Release> {
    let url = index_url(dist_base);
    let resp = http
        .get(&url)
        .send()
        .await
        .with_context(|| format!("could not reach {url}"))?;
    let status = resp.status();
    if !status.is_success() {
        bail!("nodejs.org returned {status} for {url}");
    }
    let entries: Vec<IndexEntry> = resp
        .json()
        .await
        .with_context(|| format!("unexpected response from {url}"))?;
    let key = files_key(&source.asset);
    let entry = pick_lts(&entries, key.as_deref()).ok_or_else(|| {
        anyhow!(
            "{url} lists no Node.js LTS >= {MIN_MAJOR} for {}",
            source.asset
        )
    })?;
    Ok(release_for(entry, dist_base, source))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::deps::catalog::{ArchiveKind, Checksum, Host};

    fn source(asset: &str) -> Source {
        Source {
            host: Host::NodeJs,
            repo: NODE_HOST.into(),
            tag: None,
            asset: asset.into(),
            asset_is_prefix: true,
            archive: ArchiveKind::Zip,
            binaries: vec!["node".into()],
            checksum: Checksum::SumsFile {
                asset: SUMS_FILE.into(),
            },
        }
    }

    const INDEX: &str = r#"[
      {"version":"v26.11.1","date":"2026-10-07","files":["win-x64-zip","linux-x64"],"lts":false},
      {"version":"v24.21.0","date":"2026-10-01","files":["win-x64-zip","osx-arm64-tar","linux-x64"],"lts":"Krypton"},
      {"version":"v24.20.0","date":"2026-09-01","files":["win-x64-zip","win-arm64-zip"],"lts":"Krypton"},
      {"version":"v22.30.0","date":"2026-10-02","files":["win-x64-zip"],"lts":"Jod"},
      {"version":"v20.19.9","date":"2026-10-03","files":["win-x64-zip"],"lts":"Iron"}
    ]"#;

    fn index() -> Vec<IndexEntry> {
        serde_json::from_str(INDEX).unwrap()
    }

    #[test]
    fn picks_newest_lts_with_the_build() {
        let idx = index();
        assert_eq!(pick_lts(&idx, None).unwrap().version, "v24.21.0");
        assert_eq!(
            pick_lts(&idx, Some("win-arm64-zip")).unwrap().version,
            "v24.20.0"
        );
        assert!(pick_lts(&idx, Some("linux-s390x")).is_none());
        // Never a non-LTS line, never below Node 22.
        let old: Vec<IndexEntry> = serde_json::from_str(
            r#"[{"version":"v26.0.0","lts":false},{"version":"v20.19.9","lts":"Iron"}]"#,
        )
        .unwrap();
        assert!(pick_lts(&old, None).is_none());
    }

    #[test]
    fn build_keys() {
        assert_eq!(
            files_key("node-*-win-x64.zip").as_deref(),
            Some("win-x64-zip")
        );
        assert_eq!(
            files_key("node-*-win-arm64.zip").as_deref(),
            Some("win-arm64-zip")
        );
        assert_eq!(
            files_key("node-*-darwin-arm64.tar.gz").as_deref(),
            Some("osx-arm64-tar")
        );
        assert_eq!(
            files_key("node-*-darwin-x64.tar.xz").as_deref(),
            Some("osx-x64-tar")
        );
        assert_eq!(
            files_key("node-*-linux-arm64.tar.xz").as_deref(),
            Some("linux-arm64")
        );
        assert_eq!(files_key("yt-dlp.exe"), None);
    }

    #[test]
    fn synthetic_release() {
        let idx = index();
        let src = source("node-*-win-x64.zip");
        let r = release_for(&idx[1], "https://nodejs.org/dist/", &src);
        assert_eq!(r.tag_name, "v24.21.0");
        let a = r.find(&src).unwrap();
        assert_eq!(a.name, "node-v24.21.0-win-x64.zip");
        assert_eq!(
            a.browser_download_url,
            "https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip"
        );
        assert_eq!(
            r.asset(SUMS_FILE).unwrap().browser_download_url,
            "https://nodejs.org/dist/v24.21.0/SHASUMS256.txt"
        );
        assert_eq!(r.revision(&src, a), "v24.21.0");
        assert_eq!(r.label(&src, a), "v24.21.0");
        assert_eq!(index_url("http://x/dist/"), "http://x/dist/index.json");
    }
}
