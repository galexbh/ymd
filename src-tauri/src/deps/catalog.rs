//! Declarative catalog: where each dependency comes from per OS/arch and how it is verified.
//! Pure data + pure functions; fully unit tested. Owner: A.

use crate::model::{DepId, DepLevel};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Os {
    Windows,
    Macos,
    Linux,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Arch {
    X86_64,
    Aarch64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Platform {
    pub os: Os,
    pub arch: Arch,
}

impl Platform {
    pub fn current() -> Self {
        todo!("A: from cfg!(target_os) / cfg!(target_arch)")
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArchiveKind {
    /// The asset is the executable itself.
    Raw,
    Zip,
    TarXz,
    TarGz,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Checksum {
    /// A SHA2-256SUMS-style file in the same release (`<hex>  <name>` lines).
    SumsFile { asset: String },
    /// A sidecar file containing the hex digest for this asset (e.g. Deno `.sha256sum`).
    Sidecar { asset: String },
    /// Source publishes none: served over HTTPS from the official host, shown as unverified.
    None,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Source {
    /// GitHub `owner/repo` whose releases are queried.
    pub repo: String,
    /// Release tag to use; `None` = latest.
    pub tag: Option<String>,
    /// Exact asset name, or a prefix matched with `starts_with` when `asset_is_prefix`.
    pub asset: String,
    pub asset_is_prefix: bool,
    pub archive: ArchiveKind,
    /// Executables to extract from the archive (base names without `.exe`).
    pub binaries: Vec<String>,
    pub checksum: Checksum,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DepSpec {
    pub id: DepId,
    pub level: DepLevel,
    /// Executable base name probed on PATH and in the bin dir.
    pub exe: &'static str,
    /// Args to print the version (`--version`, `-version`).
    pub version_args: &'static [&'static str],
    /// `None` when ymd cannot download it for this platform.
    pub source: Option<Source>,
    /// Copyable install command when `source` is `None`.
    pub manual_hint: Option<&'static str>,
}

/// Catalog entry for `id` on `platform`. `channel_repo` selects the yt-dlp release repo
/// (`yt-dlp/yt-dlp`, `yt-dlp/yt-dlp-nightly-builds`, `yt-dlp/yt-dlp-master-builds`).
pub fn spec(id: DepId, platform: Platform, channel_repo: &str) -> DepSpec {
    let _ = (id, platform, channel_repo);
    todo!("A")
}
