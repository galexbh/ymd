//! Declarative catalog: where each dependency comes from per OS/arch and how it is verified.
//! Pure data + pure functions; fully unit tested. Owner: A.
//!
//! Asset names were checked against the live GitHub releases API (2026-10):
//! - yt-dlp (all channels): `yt-dlp.exe`, `yt-dlp_arm64.exe`, `yt-dlp_macos`, `yt-dlp_linux`,
//!   `yt-dlp_linux_aarch64` + `SHA2-256SUMS`. Never the zipimport `yt-dlp` or `yt-dlp_x86.exe`
//!   (they lack curl_cffi).
//! - `yt-dlp/FFmpeg-Builds` tag `latest`: `ffmpeg-master-latest-{win64,winarm64}-gpl.zip`,
//!   `ffmpeg-master-latest-{linux64,linuxarm64}-gpl.tar.xz` + `checksums.sha256`. No macOS build.
//! - `denoland/deno`: `deno-<triple>.zip` + `deno-<triple>.zip.sha256sum` for every OS/arch
//!   (the Windows sidecar is PowerShell `Get-FileHash` output, see `verify::parse_sidecar`).
//! - `aria2/aria2`: `aria2-<ver>-win-64bit-build1.zip` only (no checksums, no macOS/Linux).
//! - `wez/atomicparsley`: `AtomicParsleyWindows.zip` (x64), `AtomicParsleyMacOS.zip` (arm64
//!   Mach-O only), `AtomicParsleyLinux.zip` (x86_64 glibc). No checksums.

use crate::model::{DepId, DepLevel, UpdateChannel};

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
        let os = if cfg!(target_os = "windows") {
            Os::Windows
        } else if cfg!(target_os = "macos") {
            Os::Macos
        } else {
            Os::Linux
        };
        let arch = if cfg!(target_arch = "aarch64") {
            Arch::Aarch64
        } else {
            Arch::X86_64
        };
        Self { os, arch }
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
    /// In prefix mode a `*` acts as a wildcard (`aria2-*-win-64bit-*.zip`) so versioned
    /// names can be pinned on both ends; without `*` it is a plain prefix.
    pub asset: String,
    pub asset_is_prefix: bool,
    pub archive: ArchiveKind,
    /// Executables to extract from the archive (base names without `.exe`).
    pub binaries: Vec<String>,
    pub checksum: Checksum,
}

impl Source {
    /// Whether a release asset called `name` is the one this source wants.
    pub fn matches(&self, name: &str) -> bool {
        if !self.asset_is_prefix {
            return name == self.asset;
        }
        if !self.asset.contains('*') {
            return name.starts_with(&self.asset);
        }
        glob_match(&self.asset, name)
    }
}

/// Minimal `*` glob (no `?`, no classes); `*` matches any run of characters.
fn glob_match(pattern: &str, name: &str) -> bool {
    let parts: Vec<&str> = pattern.split('*').collect();
    let (first, last) = (parts[0], parts[parts.len() - 1]);
    if !name.starts_with(first) || name.len() < first.len() + last.len() {
        return false;
    }
    let mut rest = &name[first.len()..];
    for mid in &parts[1..parts.len() - 1] {
        match rest.find(mid) {
            Some(i) => rest = &rest[i + mid.len()..],
            None => return false,
        }
    }
    rest.ends_with(last)
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

impl DepSpec {
    /// Executables ymd manages for this dep (base names). Falls back to `exe` when there is no
    /// download source, so removal/probing still has something to look at.
    pub fn binaries(&self) -> Vec<String> {
        match &self.source {
            Some(s) if !s.binaries.is_empty() => s.binaries.clone(),
            _ => vec![self.exe.to_string()],
        }
    }
}

pub const YTDLP_STABLE_REPO: &str = "yt-dlp/yt-dlp";
pub const YTDLP_NIGHTLY_REPO: &str = "yt-dlp/yt-dlp-nightly-builds";
pub const YTDLP_MASTER_REPO: &str = "yt-dlp/yt-dlp-master-builds";

/// Release repo for a yt-dlp update channel.
pub fn channel_repo(channel: UpdateChannel) -> &'static str {
    match channel {
        UpdateChannel::Stable => YTDLP_STABLE_REPO,
        UpdateChannel::Nightly => YTDLP_NIGHTLY_REPO,
        UpdateChannel::Master => YTDLP_MASTER_REPO,
    }
}

fn src(
    repo: &str,
    tag: Option<&str>,
    asset: impl Into<String>,
    archive: ArchiveKind,
    binaries: &[&str],
    checksum: Checksum,
) -> Source {
    Source {
        repo: repo.to_string(),
        tag: tag.map(str::to_string),
        asset: asset.into(),
        asset_is_prefix: false,
        archive,
        binaries: binaries.iter().map(|b| b.to_string()).collect(),
        checksum,
    }
}

/// Catalog entry for `id` on `platform`. `channel_repo` selects the yt-dlp release repo
/// (`yt-dlp/yt-dlp`, `yt-dlp/yt-dlp-nightly-builds`, `yt-dlp/yt-dlp-master-builds`).
pub fn spec(id: DepId, platform: Platform, channel_repo: &str) -> DepSpec {
    use Arch::*;
    use Os::*;
    let Platform { os, arch } = platform;
    match id {
        DepId::Ytdlp => {
            let asset = match (os, arch) {
                (Windows, X86_64) => "yt-dlp.exe",
                (Windows, Aarch64) => "yt-dlp_arm64.exe",
                // Universal2 binary: covers Intel and Apple Silicon.
                (Macos, _) => "yt-dlp_macos",
                (Linux, X86_64) => "yt-dlp_linux",
                (Linux, Aarch64) => "yt-dlp_linux_aarch64",
            };
            DepSpec {
                id,
                level: DepLevel::Required,
                exe: "yt-dlp",
                version_args: &["--version"],
                source: Some(src(
                    channel_repo,
                    None,
                    asset,
                    ArchiveKind::Raw,
                    &["yt-dlp"],
                    Checksum::SumsFile {
                        asset: "SHA2-256SUMS".into(),
                    },
                )),
                manual_hint: None,
            }
        }
        DepId::Ffmpeg => {
            let asset = match (os, arch) {
                (Windows, X86_64) => Some(("ffmpeg-master-latest-win64-gpl.zip", ArchiveKind::Zip)),
                (Windows, Aarch64) => {
                    Some(("ffmpeg-master-latest-winarm64-gpl.zip", ArchiveKind::Zip))
                }
                (Linux, X86_64) => Some((
                    "ffmpeg-master-latest-linux64-gpl.tar.xz",
                    ArchiveKind::TarXz,
                )),
                (Linux, Aarch64) => Some((
                    "ffmpeg-master-latest-linuxarm64-gpl.tar.xz",
                    ArchiveKind::TarXz,
                )),
                // FFmpeg-Builds has no macOS target; Homebrew is the reliable source there.
                (Macos, _) => None,
            };
            DepSpec {
                id,
                level: DepLevel::Required,
                exe: "ffmpeg",
                version_args: &["-version"],
                source: asset.map(|(asset, archive)| {
                    src(
                        "yt-dlp/FFmpeg-Builds",
                        Some("latest"),
                        asset,
                        archive,
                        &["ffmpeg", "ffprobe"],
                        Checksum::SumsFile {
                            asset: "checksums.sha256".into(),
                        },
                    )
                }),
                manual_hint: (os == Macos).then_some("brew install ffmpeg"),
            }
        }
        DepId::Deno => {
            let triple = match (os, arch) {
                (Windows, X86_64) => "x86_64-pc-windows-msvc",
                (Windows, Aarch64) => "aarch64-pc-windows-msvc",
                (Macos, X86_64) => "x86_64-apple-darwin",
                (Macos, Aarch64) => "aarch64-apple-darwin",
                (Linux, X86_64) => "x86_64-unknown-linux-gnu",
                (Linux, Aarch64) => "aarch64-unknown-linux-gnu",
            };
            let asset = format!("deno-{triple}.zip");
            let sidecar = format!("{asset}.sha256sum");
            DepSpec {
                id,
                level: DepLevel::Recommended,
                exe: "deno",
                version_args: &["--version"],
                source: Some(src(
                    "denoland/deno",
                    None,
                    asset,
                    ArchiveKind::Zip,
                    &["deno"],
                    Checksum::Sidecar { asset: sidecar },
                )),
                manual_hint: None,
            }
        }
        DepId::Aria2c => {
            let source = match os {
                // x64 build; Windows on ARM runs it under emulation.
                Windows => Some(Source {
                    asset_is_prefix: true,
                    ..src(
                        "aria2/aria2",
                        None,
                        "aria2-*-win-64bit-*.zip",
                        ArchiveKind::Zip,
                        &["aria2c"],
                        Checksum::None,
                    )
                }),
                Macos | Linux => None,
            };
            DepSpec {
                id,
                level: DepLevel::Optional,
                exe: "aria2c",
                version_args: &["--version"],
                source,
                manual_hint: match os {
                    Windows => None,
                    Macos => Some("brew install aria2"),
                    Linux => Some("sudo apt install aria2"),
                },
            }
        }
        DepId::Atomicparsley => {
            let asset = match (os, arch) {
                // x64 build; Windows on ARM runs it under emulation.
                (Windows, _) => Some("AtomicParsleyWindows.zip"),
                // The macOS asset is an arm64-only Mach-O.
                (Macos, Aarch64) => Some("AtomicParsleyMacOS.zip"),
                (Macos, X86_64) => None,
                (Linux, X86_64) => Some("AtomicParsleyLinux.zip"),
                (Linux, Aarch64) => None,
            };
            DepSpec {
                id,
                level: DepLevel::Optional,
                exe: "AtomicParsley",
                version_args: &["--version"],
                source: asset.map(|asset| {
                    src(
                        "wez/atomicparsley",
                        None,
                        asset,
                        ArchiveKind::Zip,
                        &["AtomicParsley"],
                        Checksum::None,
                    )
                }),
                manual_hint: match (os, asset) {
                    (_, Some(_)) => None,
                    (Macos, None) => Some("brew install atomicparsley"),
                    _ => Some("sudo apt install atomicparsley"),
                },
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PLATFORMS: [Platform; 6] = [
        Platform {
            os: Os::Windows,
            arch: Arch::X86_64,
        },
        Platform {
            os: Os::Windows,
            arch: Arch::Aarch64,
        },
        Platform {
            os: Os::Macos,
            arch: Arch::X86_64,
        },
        Platform {
            os: Os::Macos,
            arch: Arch::Aarch64,
        },
        Platform {
            os: Os::Linux,
            arch: Arch::X86_64,
        },
        Platform {
            os: Os::Linux,
            arch: Arch::Aarch64,
        },
    ];

    /// One line per OS × arch × channel × dep, so a diff shows exactly what changed.
    fn table() -> String {
        let mut out = String::new();
        for channel in [
            UpdateChannel::Stable,
            UpdateChannel::Nightly,
            UpdateChannel::Master,
        ] {
            for p in PLATFORMS {
                for id in DepId::ALL {
                    let s = spec(id, p, channel_repo(channel));
                    let line = match &s.source {
                        Some(src) => format!(
                            "{channel:?} {:?}/{:?} {id:?} [{:?}] {}@{} {}{} {:?} bins={:?} sum={:?}",
                            p.os,
                            p.arch,
                            s.level,
                            src.repo,
                            src.tag.as_deref().unwrap_or("latest-release"),
                            src.asset,
                            if src.asset_is_prefix { " (pattern)" } else { "" },
                            src.archive,
                            src.binaries,
                            src.checksum,
                        ),
                        None => format!(
                            "{channel:?} {:?}/{:?} {id:?} [{:?}] manual: {}",
                            p.os,
                            p.arch,
                            s.level,
                            s.manual_hint.unwrap_or("-"),
                        ),
                    };
                    out.push_str(&line);
                    out.push('\n');
                }
            }
        }
        out
    }

    #[test]
    fn catalog_snapshot() {
        insta::assert_snapshot!(table());
    }

    #[test]
    fn never_selects_zipimport_or_x86_ytdlp() {
        for p in PLATFORMS {
            for repo in [YTDLP_STABLE_REPO, YTDLP_NIGHTLY_REPO, YTDLP_MASTER_REPO] {
                let s = spec(DepId::Ytdlp, p, repo).source.unwrap();
                assert_ne!(s.asset, "yt-dlp");
                assert_ne!(s.asset, "yt-dlp_x86.exe");
                assert_eq!(s.repo, repo);
                assert_eq!(s.binaries, vec!["yt-dlp".to_string()]);
            }
        }
    }

    #[test]
    fn every_platform_without_source_has_a_hint() {
        for p in PLATFORMS {
            for id in DepId::ALL {
                let s = spec(id, p, YTDLP_STABLE_REPO);
                assert_eq!(s.source.is_none(), s.manual_hint.is_some(), "{id:?} {p:?}");
            }
        }
    }

    #[test]
    fn current_platform_is_consistent() {
        let p = Platform::current();
        assert_eq!(p.os == Os::Windows, cfg!(windows));
        assert_eq!(p.arch == Arch::Aarch64, cfg!(target_arch = "aarch64"));
    }

    #[test]
    fn channel_repos() {
        assert_eq!(channel_repo(UpdateChannel::Stable), "yt-dlp/yt-dlp");
        assert_eq!(
            channel_repo(UpdateChannel::Nightly),
            "yt-dlp/yt-dlp-nightly-builds"
        );
        assert_eq!(
            channel_repo(UpdateChannel::Master),
            "yt-dlp/yt-dlp-master-builds"
        );
    }

    #[test]
    fn asset_matching() {
        let aria = spec(
            DepId::Aria2c,
            Platform {
                os: Os::Windows,
                arch: Arch::X86_64,
            },
            YTDLP_STABLE_REPO,
        )
        .source
        .unwrap();
        assert!(aria.matches("aria2-1.37.0-win-64bit-build1.zip"));
        assert!(aria.matches("aria2-1.38.0-win-64bit-build2.zip"));
        assert!(!aria.matches("aria2-1.37.0-win-32bit-build1.zip"));
        assert!(!aria.matches("aria2-1.37.0-aarch64-linux-android-build1.zip"));
        assert!(!aria.matches("aria2-1.37.0.tar.xz"));

        let exact = spec(
            DepId::Ytdlp,
            Platform {
                os: Os::Linux,
                arch: Arch::X86_64,
            },
            YTDLP_STABLE_REPO,
        )
        .source
        .unwrap();
        assert!(exact.matches("yt-dlp_linux"));
        assert!(!exact.matches("yt-dlp_linux.zip"));

        let prefix = Source {
            asset_is_prefix: true,
            ..exact
        };
        assert!(prefix.matches("yt-dlp_linux.zip"));
        assert!(glob_match("a*", "a"));
        assert!(!glob_match("ab*ba", "aba"));
    }
}
