//! Install / verify / update / remove managed binaries. Owner: A.
//!
//! Contract:
//! - downloads to `<name>.part`, verifies SHA-256 when the source publishes one, aborts on mismatch
//!   without touching the installed binary;
//! - swaps atomically: existing -> `.old`, `.part` -> final, then deletes `.old` (works with a
//!   locked exe on Windows);
//! - `chmod +x` on Unix, strips `com.apple.quarantine` on macOS;
//! - never updates yt-dlp while jobs are running (caller checks `JobManager::active_count`).

use super::Tools;
use crate::model::{DepId, DepProgress, DepsReport, UpdateChannel};
use crate::paths::AppPaths;

pub type ProgressFn = std::sync::Arc<dyn Fn(DepProgress) + Send + Sync>;

pub struct DepsManager {
    pub paths: AppPaths,
    pub channel: UpdateChannel,
    /// Base URL of the GitHub API (overridable for tests): `https://api.github.com`.
    pub api_base: String,
    pub http: reqwest::Client,
}

impl DepsManager {
    pub fn new(paths: AppPaths, channel: UpdateChannel) -> Self {
        let _ = (paths, channel);
        todo!("A")
    }

    /// Test constructor pointing at a mock server.
    pub fn with_api_base(paths: AppPaths, channel: UpdateChannel, api_base: String) -> Self {
        let _ = (paths, channel, api_base);
        todo!("A")
    }

    /// Status of every dependency + JS runtime detection. Does not hit the network
    /// unless `check_latest` is true.
    pub async fn report(&self, check_latest: bool) -> anyhow::Result<DepsReport> {
        let _ = check_latest;
        todo!("A")
    }

    pub async fn install(&self, id: DepId, progress: ProgressFn) -> anyhow::Result<()> {
        let _ = (id, progress);
        todo!("A")
    }

    pub async fn remove(&self, id: DepId) -> anyhow::Result<()> {
        let _ = id;
        todo!("A")
    }

    /// Paths handed to yt-dlp. Managed copies win over system ones.
    pub async fn tools(&self) -> Tools {
        todo!("A")
    }
}
