//! Install / verify / update / remove managed binaries. Owner: A.
//!
//! Contract:
//! - downloads to `<name>.part`, verifies SHA-256 when the source publishes one, aborts on mismatch
//!   without touching the installed binary;
//! - swaps atomically: existing -> `.old`, `.part` -> final, then deletes `.old` (works with a
//!   locked exe on Windows);
//! - `chmod +x` on Unix, strips `com.apple.quarantine` on macOS;
//! - never updates yt-dlp while jobs are running (caller checks `JobManager::active_count`).
//!
//! Archives are downloaded and extracted inside a per-install work dir in the bin dir
//! (`.ymd-work-<dep>-<uuid>`), so the final rename never crosses filesystems. What was
//! installed (tag, revision, verified) is kept in `bin_dir/.ymd-manifest.json`.

use super::catalog::{self, ArchiveKind, Checksum, DepSpec, Platform, Source};
use super::github::{self, Asset, Release};
use super::manifest::{self, Manifest};
use super::version::{self, Probe, Tool};
use super::{archive, jsruntime, verify, Tools};
use crate::model::{DepId, DepPhase, DepProgress, DepState, DepStatus, DepsReport, UpdateChannel};
use crate::paths::{exe_name, AppPaths};
use anyhow::{anyhow, bail, Context};
use futures_util::StreamExt;
use std::collections::HashMap;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant};
use tokio::io::AsyncWriteExt;

pub type ProgressFn = std::sync::Arc<dyn Fn(DepProgress) + Send + Sync>;

pub const GITHUB_API: &str = "https://api.github.com";
/// Minimum gap between two `downloading` progress events (~10/s).
const PROGRESS_EVERY: Duration = Duration::from_millis(100);

type InstallLock = Arc<tokio::sync::Mutex<()>>;

/// One lock per (bin dir, dep): serializes install/remove of the same files and lets
/// `report` show `installing` while one runs. Process-wide because the app may rebuild
/// its `DepsManager` (e.g. when the bin dir setting changes) while an install is running.
static INSTALL_LOCKS: LazyLock<Mutex<HashMap<(PathBuf, DepId), InstallLock>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn install_lock(bin_dir: &Path, id: DepId) -> InstallLock {
    let mut map = INSTALL_LOCKS.lock().unwrap_or_else(|p| p.into_inner());
    map.entry((bin_dir.to_path_buf(), id)).or_default().clone()
}

fn is_installing(bin_dir: &Path, id: DepId) -> bool {
    let map = INSTALL_LOCKS.lock().unwrap_or_else(|p| p.into_inner());
    map.get(&(bin_dir.to_path_buf(), id))
        .is_some_and(|l| l.try_lock().is_err())
}

fn tool_for(id: DepId) -> Tool {
    match id {
        DepId::Ytdlp => Tool::Ytdlp,
        DepId::Ffmpeg => Tool::Ffmpeg,
        DepId::Deno => Tool::Deno,
        DepId::Aria2c => Tool::Aria2c,
        DepId::Atomicparsley => Tool::AtomicParsley,
    }
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut s: OsString = path.as_os_str().to_owned();
    s.push(suffix);
    PathBuf::from(s)
}

/// A system copy is outdated when the release uses real version tags (not a rolling tag like
/// `latest`) and its known version is older than the tag. Unknown versions are not flagged.
fn system_outdated(
    source: &crate::deps::catalog::Source,
    tag: &str,
    version: &Option<String>,
) -> bool {
    source.tag.is_none()
        && version
            .as_deref()
            .is_some_and(|v| !version::at_least(v, version::normalize_tag(tag)))
}

/// Path of `exe` on the system (PATH, plus Homebrew dirs on macOS, which GUI apps launched
/// from Finder do not get on PATH). Anything inside `bin_dir` is managed, not system.
fn system_path(exe: &str, bin_dir: &Path) -> Option<PathBuf> {
    let inside_bin = |p: &Path| {
        p.parent().is_some_and(|d| {
            d == bin_dir
                || matches!((d.canonicalize(), bin_dir.canonicalize()), (Ok(a), Ok(b)) if a == b)
        })
    };
    if let Ok(found) = which::which(exe) {
        if !inside_bin(&found) {
            return Some(found);
        }
    }
    if cfg!(target_os = "macos") {
        for dir in ["/opt/homebrew/bin", "/usr/local/bin"] {
            let p = Path::new(dir).join(exe);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

/// Make a staged file runnable: `chmod 755` on Unix, drop quarantine on macOS.
fn prepare_executable(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))?;
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("xattr")
            .args(["-d", "com.apple.quarantine"])
            .arg(path)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }
    let _ = path;
    Ok(())
}

/// Move `final_` out of the way (to `.old`), so a running/locked exe can still be replaced
/// on Windows. Uses a unique name if a stale `.old` cannot be removed.
fn move_aside(final_: &Path) -> std::io::Result<PathBuf> {
    let old = with_suffix(final_, ".old");
    let old = if old.exists() && std::fs::remove_file(&old).is_err() {
        with_suffix(final_, &format!(".{}.old", uuid::Uuid::new_v4().simple()))
    } else {
        old
    };
    std::fs::rename(final_, &old)?;
    Ok(old)
}

/// `existing -> .old`, `staged -> final`, delete `.old` (best effort: a locked exe on
/// Windows stays until the next start). Restores the old file if the final rename fails.
pub(crate) fn swap_into_place(staged: &Path, final_: &Path) -> std::io::Result<()> {
    let old = if final_.exists() {
        Some(move_aside(final_)?)
    } else {
        None
    };
    if let Err(e) = std::fs::rename(staged, final_) {
        if let Some(old) = &old {
            let _ = std::fs::rename(old, final_);
        }
        return Err(e);
    }
    if let Some(old) = old {
        let _ = std::fs::remove_file(old);
    }
    Ok(())
}

/// Delete a managed file; if it is locked (running exe on Windows), rename it aside instead.
fn remove_managed(path: &Path) -> std::io::Result<()> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => match move_aside(path) {
            Ok(old) => {
                let _ = std::fs::remove_file(old);
                Ok(())
            }
            Err(_) => Err(e),
        },
    }
}

/// Best-effort removal of `*.old` leftovers from previous swaps.
fn clean_old_files(bin_dir: &Path) {
    let Ok(entries) = std::fs::read_dir(bin_dir) else {
        return;
    };
    for e in entries.flatten() {
        if e.file_name().to_string_lossy().ends_with(".old") {
            let _ = std::fs::remove_file(e.path());
        }
    }
}

fn emit(
    progress: &ProgressFn,
    id: DepId,
    phase: DepPhase,
    received: u64,
    total: Option<u64>,
    message: Option<String>,
) {
    progress(DepProgress {
        id,
        phase,
        received,
        total,
        message,
    });
}

pub struct DepsManager {
    pub paths: AppPaths,
    pub channel: UpdateChannel,
    /// Base URL of the GitHub API (overridable for tests): `https://api.github.com`.
    pub api_base: String,
    pub http: reqwest::Client,
}

impl DepsManager {
    pub fn new(paths: AppPaths, channel: UpdateChannel) -> Self {
        Self::with_api_base(paths, channel, GITHUB_API.to_string())
    }

    /// Test constructor pointing at a mock server.
    pub fn with_api_base(paths: AppPaths, channel: UpdateChannel, api_base: String) -> Self {
        let http = reqwest::Client::builder()
            .user_agent(concat!("ymd/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(20))
            .read_timeout(Duration::from_secs(60))
            .build()
            .unwrap_or_default();
        clean_old_files(&paths.bin_dir);
        Self {
            paths,
            channel,
            api_base,
            http,
        }
    }

    fn spec(&self, id: DepId) -> DepSpec {
        catalog::spec(id, Platform::current(), catalog::channel_repo(self.channel))
    }

    /// Managed copy if present, else the system one.
    fn resolve_exe(&self, exe: &str) -> Option<PathBuf> {
        let managed = self.paths.bin(exe);
        if managed.is_file() {
            Some(managed)
        } else {
            system_path(exe, &self.paths.bin_dir)
        }
    }

    async fn resolve_release(&self, source: &Source) -> anyhow::Result<(Release, Asset)> {
        let release = github::fetch_release(
            &self.http,
            &self.api_base,
            &source.repo,
            source.tag.as_deref(),
        )
        .await?;
        let asset = release.find(source)?.clone();
        Ok((release, asset))
    }

    /// Status of every dependency + JS runtime detection. Does not hit the network
    /// unless `check_latest` is true.
    pub async fn report(&self, check_latest: bool) -> anyhow::Result<DepsReport> {
        let manifest = Manifest::load(&self.paths.bin_dir);
        let statuses = futures_util::future::join_all(
            DepId::ALL.map(|id| self.status(id, &manifest, check_latest)),
        );
        let (deps, js) = tokio::join!(statuses, jsruntime::detect(&self.paths.bin_dir));
        Ok(DepsReport {
            bin_dir: self.paths.bin_dir.to_string_lossy().into_owned(),
            deps,
            js_runtime: js.first().cloned(),
            js_runtimes_found: js,
        })
    }

    async fn status(&self, id: DepId, manifest: &Manifest, check_latest: bool) -> DepStatus {
        let spec = self.spec(id);
        let managed = self.paths.bin(spec.exe);
        let (state, path) = if managed.is_file() {
            (DepState::Installed, Some(managed))
        } else if let Some(p) = system_path(spec.exe, &self.paths.bin_dir) {
            (DepState::System, Some(p))
        } else {
            (DepState::Missing, None)
        };
        let entry = manifest.get(id).filter(|_| state == DepState::Installed);

        let (version, mut error) = match &path {
            Some(p) => match version::probe(p, spec.version_args, tool_for(id)).await {
                Probe::Version(v) => (v, None),
                Probe::Failed(e) => (None, Some(e)),
            },
            None => (None, None),
        };

        let mut latest = None;
        let mut update_available = false;
        if let (true, Some(source)) = (check_latest, &spec.source) {
            match self.resolve_release(source).await {
                Ok((release, asset)) => {
                    latest = Some(release.label(source, &asset));
                    if state == DepState::System {
                        // A system copy is never touched, but an outdated one is worth
                        // replacing with a managed copy (managed wins in `tools()`).
                        update_available = system_outdated(source, &release.tag_name, &version);
                    } else if state == DepState::Installed {
                        update_available = match entry {
                            Some(e) => e.revision != release.revision(source, &asset),
                            // Placed by hand: compare its version with the tag when the tag
                            // is a real version (not a rolling tag like `latest`).
                            None => {
                                source.tag.is_none()
                                    && version.as_deref().is_some_and(|v| {
                                        version::normalize_tag(&release.tag_name)
                                            != version::normalize_tag(v)
                                    })
                            }
                        };
                    }
                }
                Err(e) => {
                    error.get_or_insert_with(|| format!("could not check for updates: {e:#}"));
                }
            }
        }

        DepStatus {
            id,
            level: spec.level,
            state: if is_installing(&self.paths.bin_dir, id) {
                DepState::Installing
            } else {
                state
            },
            version,
            path: path.map(|p| p.to_string_lossy().into_owned()),
            latest,
            update_available,
            verified: entry.is_some_and(|e| e.verified),
            can_install: spec.source.is_some(),
            manual_hint: spec.manual_hint.map(str::to_string),
            error,
        }
    }

    pub async fn install(&self, id: DepId, progress: ProgressFn) -> anyhow::Result<()> {
        let lock = install_lock(&self.paths.bin_dir, id);
        let _guard = lock.lock().await;
        let result = self.install_locked(id, &progress).await;
        match &result {
            Ok(()) => emit(&progress, id, DepPhase::Done, 0, None, None),
            Err(e) => emit(
                &progress,
                id,
                DepPhase::Error,
                0,
                None,
                Some(format!("{e:#}")),
            ),
        }
        result
    }

    async fn install_locked(&self, id: DepId, progress: &ProgressFn) -> anyhow::Result<()> {
        let spec = self.spec(id);
        let Some(source) = spec.source.clone() else {
            let hint = spec
                .manual_hint
                .map(|h| format!("; install it with `{h}`"))
                .unwrap_or_default();
            bail!(
                "{} cannot be installed by ymd on this platform{hint}",
                spec.exe
            );
        };
        emit(progress, id, DepPhase::Resolving, 0, None, None);
        let (release, asset) = self.resolve_release(&source).await?;
        let (expected, verified) = self.expected_digest(&release, &asset, &source).await?;

        let bin_dir = &self.paths.bin_dir;
        std::fs::create_dir_all(bin_dir)
            .with_context(|| format!("create {}", bin_dir.display()))?;
        self.clean_leftovers(id, &source);
        let work = bin_dir.join(format!(
            ".ymd-work-{}-{}",
            manifest::key(id),
            uuid::Uuid::new_v4().simple()
        ));
        std::fs::create_dir_all(&work)?;
        let finals: Vec<PathBuf> = source.binaries.iter().map(|b| self.paths.bin(b)).collect();
        let raw_part = with_suffix(&finals[0], ".part");

        let result = self
            .download_verify_swap(
                id, &source, &asset, expected, &work, &raw_part, &finals, progress,
            )
            .await;
        let _ = std::fs::remove_dir_all(&work);
        let _ = std::fs::remove_file(&raw_part);
        result?;

        let entry = manifest::Entry {
            tag: release.tag_name.clone(),
            revision: release.revision(&source, &asset),
            asset: asset.name.clone(),
            verified,
            installed_at: chrono::Utc::now().to_rfc3339(),
            files: source.binaries.iter().map(|b| exe_name(b)).collect(),
        };
        manifest::update(bin_dir, |m| {
            m.deps.insert(manifest::key(id).to_string(), entry);
        })?;
        Ok(())
    }

    /// Expected SHA-256 and whether it comes from a checksum the publisher released.
    /// Without one, GitHub's upload digest (when present) still guards transport integrity.
    async fn expected_digest(
        &self,
        release: &Release,
        asset: &Asset,
        source: &Source,
    ) -> anyhow::Result<(Option<String>, bool)> {
        let (sums_asset, sidecar) = match &source.checksum {
            Checksum::SumsFile { asset } => (asset, false),
            Checksum::Sidecar { asset } => (asset, true),
            Checksum::None => return Ok((asset.sha256().map(str::to_string), false)),
        };
        let sums = release.asset(sums_asset)?;
        let text = github::fetch_text(&self.http, &sums.browser_download_url).await?;
        let hex = if sidecar {
            verify::parse_sidecar(&text)
        } else {
            verify::parse_sums_file(&text, &asset.name)
        };
        let hex = hex.ok_or_else(|| anyhow!("{} has no checksum for {}", sums.name, asset.name))?;
        Ok((Some(hex), true))
    }

    /// Remove `.part`/work leftovers of a previous, interrupted install of this dep.
    fn clean_leftovers(&self, id: DepId, source: &Source) {
        for b in &source.binaries {
            let _ = std::fs::remove_file(with_suffix(&self.paths.bin(b), ".part"));
        }
        let prefix = format!(".ymd-work-{}-", manifest::key(id));
        if let Ok(entries) = std::fs::read_dir(&self.paths.bin_dir) {
            for e in entries.flatten() {
                if e.file_name().to_string_lossy().starts_with(&prefix) {
                    let _ = std::fs::remove_dir_all(e.path());
                }
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    async fn download_verify_swap(
        &self,
        id: DepId,
        source: &Source,
        asset: &Asset,
        expected: Option<String>,
        work: &Path,
        raw_part: &Path,
        finals: &[PathBuf],
        progress: &ProgressFn,
    ) -> anyhow::Result<()> {
        let download = match source.archive {
            ArchiveKind::Raw => raw_part.to_path_buf(),
            _ => work.join(format!("{}.part", asset.name)),
        };
        self.download(
            &asset.browser_download_url,
            &download,
            id,
            asset.size,
            progress,
        )
        .await?;

        if let Some(hex) = expected {
            emit(progress, id, DepPhase::Verifying, 0, None, None);
            let file = download.clone();
            tokio::task::spawn_blocking(move || verify::verify_file(&file, &hex))
                .await?
                .with_context(|| format!("{} failed verification", asset.name))?;
        }

        let staged: Vec<PathBuf> = match &source.archive {
            ArchiveKind::Raw => vec![download],
            kind => {
                emit(progress, id, DepPhase::Extracting, 0, None, None);
                let wanted: Vec<String> = source.binaries.iter().map(|b| exe_name(b)).collect();
                let (kind, dest) = (kind.clone(), work.join("extract"));
                tokio::task::spawn_blocking(move || {
                    archive::extract(&download, &kind, &wanted, &dest)
                })
                .await?
                .with_context(|| format!("could not extract {}", asset.name))?
            }
        };

        for s in &staged {
            prepare_executable(s)?;
        }
        for (s, f) in staged.iter().zip(finals) {
            swap_into_place(s, f).with_context(|| format!("could not replace {}", f.display()))?;
        }
        Ok(())
    }

    async fn download(
        &self,
        url: &str,
        dest: &Path,
        id: DepId,
        size_hint: u64,
        progress: &ProgressFn,
    ) -> anyhow::Result<()> {
        let resp = self
            .http
            .get(url)
            .send()
            .await
            .with_context(|| format!("could not reach {url}"))?;
        let status = resp.status();
        if !status.is_success() {
            bail!("download of {url} failed: {status}");
        }
        let total = resp
            .content_length()
            .or((size_hint > 0).then_some(size_hint));
        let mut file = tokio::fs::File::create(dest)
            .await
            .with_context(|| format!("create {}", dest.display()))?;
        let mut stream = resp.bytes_stream();
        let mut received = 0u64;
        let mut last = Instant::now();
        emit(progress, id, DepPhase::Downloading, 0, total, None);
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.with_context(|| format!("download of {url} was interrupted"))?;
            file.write_all(&chunk).await?;
            received += chunk.len() as u64;
            if last.elapsed() >= PROGRESS_EVERY {
                emit(progress, id, DepPhase::Downloading, received, total, None);
                last = Instant::now();
            }
        }
        file.flush().await?;
        file.sync_all().await?;
        drop(file);
        emit(progress, id, DepPhase::Downloading, received, total, None);
        if let Some(t) = total {
            if received != t {
                bail!("download of {url} is incomplete ({received} of {t} bytes)");
            }
        }
        Ok(())
    }

    pub async fn remove(&self, id: DepId) -> anyhow::Result<()> {
        let lock = install_lock(&self.paths.bin_dir, id);
        let _guard = lock.lock().await;
        let spec = self.spec(id);
        for b in spec.binaries() {
            let p = self.paths.bin(&b);
            remove_managed(&p).with_context(|| format!("could not remove {}", p.display()))?;
            let _ = std::fs::remove_file(with_suffix(&p, ".part"));
        }
        if manifest::path(&self.paths.bin_dir).exists() {
            manifest::update(&self.paths.bin_dir, |m| {
                m.deps.remove(manifest::key(id));
            })?;
        }
        Ok(())
    }

    /// Paths handed to yt-dlp. Managed copies win over system ones.
    pub async fn tools(&self) -> Tools {
        let js = jsruntime::detect(&self.paths.bin_dir).await;
        let ffmpeg_dir = if self.paths.bin("ffmpeg").is_file() {
            Some(self.paths.bin_dir.clone())
        } else {
            system_path("ffmpeg", &self.paths.bin_dir)
                .and_then(|p| p.parent().map(Path::to_path_buf))
        };
        Tools {
            ytdlp: self.resolve_exe("yt-dlp"),
            ffmpeg_dir,
            js_runtime: js.into_iter().next(),
            aria2c: self.resolve_exe("aria2c"),
            atomicparsley: self.resolve_exe("AtomicParsley"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_copy_outdated_only_when_older_than_a_real_tag() {
        let spec = crate::deps::catalog::spec(
            DepId::Ytdlp,
            crate::deps::catalog::Platform::current(),
            crate::deps::catalog::YTDLP_NIGHTLY_REPO,
        );
        let src = spec.source.unwrap();
        let v = |s: &str| Some(s.to_string());
        assert!(system_outdated(&src, "2026.10.07.234512", &v("2026.03.17")));
        assert!(!system_outdated(
            &src,
            "2026.10.07.234512",
            &v("2026.10.07.234512")
        ));
        assert!(!system_outdated(&src, "2026.08.19", &v("2026.10.01")));
        assert!(!system_outdated(&src, "2026.08.19", &None));
        let mut rolling = src.clone();
        rolling.tag = Some("latest".into());
        assert!(!system_outdated(&rolling, "latest", &v("N-1")));
    }

    #[test]
    fn swap_replaces_and_cleans_old() {
        let dir = tempfile::tempdir().unwrap();
        let final_ = dir.path().join("tool");
        let staged = dir.path().join("tool.part");
        std::fs::write(&final_, b"v1").unwrap();
        std::fs::write(&staged, b"v2").unwrap();
        swap_into_place(&staged, &final_).unwrap();
        assert_eq!(std::fs::read(&final_).unwrap(), b"v2");
        assert!(!staged.exists());
        assert!(!with_suffix(&final_, ".old").exists());
    }

    #[test]
    fn swap_into_empty_slot_and_failed_swap_restores() {
        let dir = tempfile::tempdir().unwrap();
        let final_ = dir.path().join("tool");
        let staged = dir.path().join("tool.part");
        std::fs::write(&staged, b"v1").unwrap();
        swap_into_place(&staged, &final_).unwrap();
        assert_eq!(std::fs::read(&final_).unwrap(), b"v1");
        // Staged file missing: the rename fails and the old binary comes back.
        assert!(swap_into_place(&staged, &final_).is_err());
        assert_eq!(std::fs::read(&final_).unwrap(), b"v1");
    }

    #[test]
    fn stale_old_is_cleaned_on_construct() {
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("yt-dlp.old"), b"x").unwrap();
        std::fs::write(bin.join("keep"), b"x").unwrap();
        let paths = AppPaths::new(
            dir.path().into(),
            dir.path().into(),
            Some(bin.to_str().unwrap()),
        );
        let _m = DepsManager::new(paths, UpdateChannel::Stable);
        assert!(!bin.join("yt-dlp.old").exists());
        assert!(bin.join("keep").exists());
    }

    #[test]
    fn suffix() {
        assert_eq!(
            with_suffix(Path::new("a/yt-dlp.exe"), ".part"),
            Path::new("a/yt-dlp.exe.part")
        );
    }
}
