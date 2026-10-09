//! Download queue. Owner: B.
//!
//! - bounded concurrency (`tokio::sync::Semaphore`, resized when settings change);
//! - one yt-dlp child per job, stdout parsed with `ytdlp::progress`, stderr tail kept for errors;
//! - `Job` updates go to the `JobEnv` throttled to ~4/s per job (terminal states always sent);
//! - cancel kills the process tree (`process::kill_tree`) and removes `*.part` / `*.ytdl` leftovers
//!   in the job's tmp dir;
//! - retry re-enqueues a terminal job with the same request.

use crate::deps::Tools;
use crate::model::{EnqueueRequest, Job, JobId, Preset, Settings};
use std::path::PathBuf;
use std::sync::Arc;

/// Everything a job needs from the outside world; faked in tests.
pub trait JobEnv: Send + Sync + 'static {
    fn settings(&self) -> Settings;
    /// Async because it may detect tools on disk.
    fn tools(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = Tools> + Send + '_>>;
    /// Auth argv for this request (cookies, netrc-cmd, transient video password / 2FA).
    fn auth_args(&self, req: &EnqueueRequest) -> Vec<String>;
    fn tmp_dir(&self) -> PathBuf;
    fn archive_file(&self) -> PathBuf;
    /// Every state change (throttled for progress).
    fn emit(&self, job: &Job);
    /// Job reached `Done`: record history, notify.
    fn completed(&self, job: &Job, preset: &Preset);
}

pub struct JobManager {
    _env: Arc<dyn JobEnv>,
}

impl JobManager {
    pub fn new(env: Arc<dyn JobEnv>) -> Arc<Self> {
        let _ = env;
        todo!("B")
    }

    /// Validates the preset and output dir, creates one queued `Job`, and starts it when a slot frees.
    pub async fn enqueue(self: &Arc<Self>, req: EnqueueRequest) -> anyhow::Result<Job> {
        let _ = req;
        todo!("B")
    }

    pub async fn cancel(&self, id: &JobId) -> anyhow::Result<()> {
        let _ = id;
        todo!("B")
    }

    pub async fn retry(self: &Arc<Self>, id: &JobId) -> anyhow::Result<Job> {
        let _ = id;
        todo!("B")
    }

    /// Removes a terminal job from the list (does not touch files).
    pub async fn remove(&self, id: &JobId) -> anyhow::Result<()> {
        let _ = id;
        todo!("B")
    }

    pub async fn clear_finished(&self) -> Vec<JobId> {
        todo!("B")
    }

    pub async fn list(&self) -> Vec<Job> {
        todo!("B")
    }

    pub async fn active_count(&self) -> usize {
        todo!("B")
    }

    /// Apply a new concurrency limit to queued jobs.
    pub async fn set_concurrency(&self, n: u32) {
        let _ = n;
        todo!("B")
    }
}
