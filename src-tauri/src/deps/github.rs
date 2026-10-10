//! Minimal GitHub Releases API client. Owner: A.

use super::catalog::Source;
use anyhow::{anyhow, bail, Context};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Release {
    pub tag_name: String,
    #[serde(default)]
    pub published_at: Option<String>,
    #[serde(default)]
    pub assets: Vec<Asset>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Asset {
    pub name: String,
    pub browser_download_url: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub updated_at: Option<String>,
    /// `sha256:<hex>` computed by GitHub on upload (absent on older assets).
    #[serde(default)]
    pub digest: Option<String>,
}

impl Asset {
    /// GitHub's own SHA-256 for the asset, when present.
    pub fn sha256(&self) -> Option<&str> {
        self.digest.as_deref()?.strip_prefix("sha256:")
    }
}

impl Release {
    pub fn asset(&self, name: &str) -> anyhow::Result<&Asset> {
        self.assets
            .iter()
            .find(|a| a.name == name)
            .ok_or_else(|| anyhow!("release {} has no asset named {name}", self.tag_name))
    }

    pub fn find(&self, source: &Source) -> anyhow::Result<&Asset> {
        self.assets
            .iter()
            .find(|a| source.matches(&a.name))
            .ok_or_else(|| {
                anyhow!(
                    "release {} of {} has no asset matching {}",
                    self.tag_name,
                    source.repo,
                    source.asset
                )
            })
    }

    /// Identity of what would be installed: the tag, or for rolling tags (`latest`) the
    /// asset's upload time, since the tag itself never changes.
    pub fn revision(&self, source: &Source, asset: &Asset) -> String {
        if source.tag.is_some() {
            if let Some(t) = asset.updated_at.as_ref().or(self.published_at.as_ref()) {
                return format!("{}@{t}", self.tag_name);
            }
        }
        self.tag_name.clone()
    }

    /// Human-facing "latest" label: the tag, or the build date for rolling tags.
    pub fn label(&self, source: &Source, asset: &Asset) -> String {
        if source.tag.is_some() {
            if let Some(t) = asset.updated_at.as_ref().or(self.published_at.as_ref()) {
                return t.get(..10).unwrap_or(t).to_string();
            }
        }
        self.tag_name.clone()
    }
}

pub fn release_url(api_base: &str, repo: &str, tag: Option<&str>) -> String {
    let base = api_base.trim_end_matches('/');
    match tag {
        Some(t) => format!("{base}/repos/{repo}/releases/tags/{t}"),
        None => format!("{base}/repos/{repo}/releases/latest"),
    }
}

pub async fn fetch_release(
    http: &reqwest::Client,
    api_base: &str,
    repo: &str,
    tag: Option<&str>,
) -> anyhow::Result<Release> {
    let url = release_url(api_base, repo, tag);
    let resp = http
        .get(&url)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .with_context(|| format!("could not reach {url}"))?;
    let status = resp.status();
    if !status.is_success() {
        let limited = resp
            .headers()
            .get("x-ratelimit-remaining")
            .is_some_and(|v| v == "0");
        if limited {
            bail!("GitHub API rate limit reached; try again later ({url})");
        }
        bail!("GitHub API returned {status} for {url}");
    }
    resp.json::<Release>()
        .await
        .with_context(|| format!("unexpected response from {url}"))
}

/// Fetch a small text asset (checksum files).
pub async fn fetch_text(http: &reqwest::Client, url: &str) -> anyhow::Result<String> {
    let resp = http
        .get(url)
        .send()
        .await
        .with_context(|| format!("could not reach {url}"))?;
    let status = resp.status();
    if !status.is_success() {
        bail!("download of {url} failed: {status}");
    }
    Ok(resp.text().await?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::deps::catalog::{ArchiveKind, Checksum};

    fn source(tag: Option<&str>) -> Source {
        Source {
            repo: "o/r".into(),
            tag: tag.map(Into::into),
            asset: "a.zip".into(),
            asset_is_prefix: false,
            archive: ArchiveKind::Zip,
            binaries: vec!["a".into()],
            checksum: Checksum::None,
        }
    }

    #[test]
    fn parses_api_json_and_revisions() {
        let json = r#"{"tag_name":"latest","published_at":"2026-10-08T19:51:15Z","assets":[
            {"name":"a.zip","browser_download_url":"https://x/a.zip","size":3,
             "updated_at":"2026-10-08T19:50:55Z","digest":"sha256:abc"},
            {"name":"b.zip","browser_download_url":"https://x/b.zip","size":3,"digest":null}]}"#;
        let r: Release = serde_json::from_str(json).unwrap();
        let a = r.find(&source(None)).unwrap();
        assert_eq!(a.sha256(), Some("abc"));
        assert_eq!(r.asset("b.zip").unwrap().sha256(), None);
        assert!(r.asset("c.zip").is_err());
        assert_eq!(r.revision(&source(None), a), "latest");
        assert_eq!(
            r.revision(&source(Some("latest")), a),
            "latest@2026-10-08T19:50:55Z"
        );
        assert_eq!(r.label(&source(Some("latest")), a), "2026-10-08");
        assert_eq!(r.label(&source(None), a), "latest");
    }

    #[test]
    fn urls() {
        assert_eq!(
            release_url("https://api.github.com/", "a/b", None),
            "https://api.github.com/repos/a/b/releases/latest"
        );
        assert_eq!(
            release_url("http://127.0.0.1:1", "a/b", Some("latest")),
            "http://127.0.0.1:1/repos/a/b/releases/tags/latest"
        );
    }
}
