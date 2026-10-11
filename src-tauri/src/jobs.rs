//! Download queue. Owner: B.
//!
//! - bounded concurrency: a FIFO queue plus a scheduler (`pump`) that starts jobs while fewer
//!   than `limit` are running; `set_concurrency` resizes the limit and starts queued jobs;
//! - scheduled start (`set_start_at`, in memory only): `pump` starts nothing before that
//!   instant; a timer clears it then and pumps. A newer schedule (or a clear) supersedes the
//!   running timer through a generation counter;
//! - one yt-dlp child per job; stdout **and** stderr are parsed with `ytdlp::progress` (yt-dlp
//!   writes postprocessor progress to stderr in quiet mode), the last non-marker stderr lines are
//!   kept for error classification;
//! - `Job` updates go to the `JobEnv` throttled to ~4/s per job; stage changes, title / file /
//!   playlist-item changes and terminal states are always sent;
//! - cancel kills the process tree (`process::kill_tree`) and removes the job's tmp dir (where
//!   yt-dlp keeps `*.part` / `*.ytdl` files because of `-P temp:`);
//! - retry re-enqueues a terminal job with the same request (new id and seq);
//! - transient secrets in `EnqueueRequest` (video password / 2FA) stay in this in-memory map
//!   only while the job is queued or running; they are never copied into `Job`, emitted,
//!   persisted or logged, and they are dropped when the job ends (so a retry of such a job
//!   fails with `LoginRequired`: the link has to be added again with the secret);
//! - ymd can stay in the tray for days: only the newest [`MAX_FINISHED_JOBS`] finished jobs
//!   are kept in the list, older ones are evicted (`JobEnv::removed`). Output lines are capped
//!   at [`MAX_LINE_BYTES`] and error details at [`errors::MAX_DETAIL_BYTES`];
//! - a panic while a job runs still ends it as `Error` and frees its slot (`RunGuard`);
//! - every queued job is also saved as a `PendingJob` (`JobEnv::pending_save`) and forgotten
//!   when it ends. When ymd exits (`shutdown`), running jobs are killed but keep their row and
//!   their `tmp/<id>` dir, so `resume` can start them again with the same id and yt-dlp
//!   continues from its `.part` files;
//! - each running job is a `job{id, preset, kind}` tracing span; a stage change logs how long
//!   the previous stage took (`stage finished`) and the end logs the outcome and `ErrorCode`
//!   (`job finished`). The URL and the argv are never logged.

use crate::deps::Tools;
use crate::diagnostics::{elapsed_ms, kind_name, stage_name, wire_name, MSG_JOB, MSG_STAGE};
use crate::model::{
    CommandError, EnqueueRequest, ErrorCode, Job, JobError, JobId, JobStage, MediaKind, PendingJob,
    Preset, Settings,
};
use crate::process;
use crate::ytdlp::progress::{self, Event};
use crate::ytdlp::{args, errors};
use futures_util::FutureExt;
use std::collections::{HashMap, HashSet, VecDeque};
use std::panic::AssertUnwindSafe;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, Weak};
use std::time::{Duration, Instant};
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::sync::{mpsc, Notify};
use tracing::Instrument;

/// Minimum time between two throttled progress emissions of the same job (≤ 4/s).
pub const EMIT_INTERVAL: Duration = Duration::from_millis(250);
/// stderr lines kept for the error detail / classification.
pub const STDERR_TAIL: usize = 50;
/// Finished (done, canceled, failed) jobs kept in the list; older ones are evicted.
pub const MAX_FINISHED_JOBS: usize = 200;
/// Longest output line kept from yt-dlp / ffmpeg / aria2c; the rest of a longer line is dropped.
pub const MAX_LINE_BYTES: usize = 8 * 1024;

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
    /// Job reached `Done`: record history.
    fn completed(&self, job: &Job, preset: &Preset);
    /// First accession number of this session (numbers continue across sessions).
    fn first_seq(&self) -> u64 {
        1
    }
    /// The scheduled queue start changed (RFC 3339, UTC; `None` = the queue runs freely).
    fn schedule_changed(&self, _start_at: Option<&str>) {}
    /// A job was queued: remember it so it can be resumed after a restart.
    fn pending_save(&self, _pending: &PendingJob) {}
    /// A job ended (or was removed): forget it.
    fn pending_delete(&self, _id: &JobId) {}
    /// A finished job left the list on its own (evicted beyond [`MAX_FINISHED_JOBS`]).
    fn removed(&self, _id: &JobId) {}
}

/// The row that lets `job` be resumed later. Secrets are never copied, only flagged.
fn has_secret(req: &EnqueueRequest) -> bool {
    let given = |s: &Option<String>| s.as_deref().is_some_and(|v| !v.is_empty());
    given(&req.video_password) || given(&req.twofactor)
}

pub fn pending_of(job: &Job, req: &EnqueueRequest) -> PendingJob {
    PendingJob {
        id: job.id.clone(),
        seq: job.seq,
        url: job.url.clone(),
        preset_id: job.preset_id.clone(),
        playlist_items: req.playlist_items.clone(),
        output_dir: job.output_dir.clone(),
        title: job.title.clone(),
        thumbnail: job.thumbnail.clone(),
        kind: job.kind,
        created_at: job.created_at.clone(),
        needs_secret: has_secret(req),
        clip: req.clip,
    }
}

/// Checks a requested time range: finite, `0 <= start < end`, and a single video only.
pub fn validate_clip(req: &EnqueueRequest) -> Result<(), CommandError> {
    let Some(clip) = req.clip else {
        return Ok(());
    };
    if req.playlist_items.is_some() {
        return Err(CommandError::new(
            ErrorCode::Unknown,
            "a time range can only be downloaded from a single video, not a playlist",
        ));
    }
    let ok = clip.start.is_finite() && clip.end.is_finite() && clip.start >= 0.0;
    if !ok || clip.start >= clip.end {
        return Err(CommandError::new(
            ErrorCode::Unknown,
            format!(
                "invalid time range {}-{}: start must be at least 0 and before the end",
                clip.start, clip.end
            ),
        ));
    }
    Ok(())
}

/// A job id as `enqueue` makes them: a UUID in its canonical lowercase, hyphenated form.
fn is_job_id(s: &str) -> bool {
    uuid::Uuid::try_parse(s).is_ok_and(|u| u.to_string() == s)
}

/// Deletes `tmp/<id>` of a discarded job. Only ids shaped like a job id (a UUID) are touched,
/// so an id from the UI can never point outside `tmp_dir`.
pub fn discard_tmp(tmp_dir: &Path, id: &str) -> bool {
    if !is_job_id(id) {
        return false;
    }
    std::fs::remove_dir_all(tmp_dir.join(id)).is_ok()
}

/// Removes job dirs in `tmp_dir` (named by a job's UUID) that belong to no pending job; other
/// entries (e.g. cookie copies, see `auth::cookies::sweep_stale_copies`) are left alone.
/// Returns how many were removed.
pub fn sweep_orphan_tmp(tmp_dir: &Path, keep: &HashSet<JobId>) -> usize {
    let Ok(entries) = std::fs::read_dir(tmp_dir) else {
        return 0;
    };
    let mut removed = 0;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_dir = entry.file_type().is_ok_and(|t| t.is_dir());
        if !is_dir || !is_job_id(&name) || keep.contains(&name) {
            continue;
        }
        if std::fs::remove_dir_all(entry.path()).is_ok() {
            removed += 1;
        }
    }
    removed
}

/// Longest single sleep of the schedule timer: the wall clock is re-read after each one, so a
/// computer that slept through the scheduled time still starts the queue promptly.
const SCHEDULE_TICK: Duration = Duration::from_secs(30);

fn rfc3339(t: chrono::DateTime<chrono::Utc>) -> String {
    t.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

struct Entry {
    job: Job,
    req: EnqueueRequest,
    cancel: Arc<Notify>,
    cancel_requested: bool,
    last_emit: Option<Instant>,
    /// When the job left the queue and when its current stage began (for the logs).
    started: Option<Instant>,
    stage_since: Option<Instant>,
    /// Order in which jobs reached a terminal state (eviction drops the lowest first).
    finished_tick: u64,
    /// A video password / 2FA code was given and dropped when the job ended.
    secret_dropped: bool,
}

impl Entry {
    /// The job reached a terminal state: forget its transient secrets.
    fn ended(&mut self, tick: u64) {
        self.finished_tick = tick;
        if has_secret(&self.req) {
            self.secret_dropped = true;
        }
        self.req.video_password = None;
        self.req.twofactor = None;
    }
}

#[derive(Default)]
struct Inner {
    jobs: HashMap<JobId, Entry>,
    queue: VecDeque<JobId>,
    running: usize,
    /// Read lazily from settings: `JobManager::new` runs before the app state exists.
    limit: Option<usize>,
    next_seq: Option<u64>,
    /// Queued jobs wait until this instant (`None` = start as soon as a slot is free).
    start_at: Option<chrono::DateTime<chrono::Utc>>,
    /// Bumped on every `set_start_at`; a timer whose generation is stale does nothing.
    schedule_gen: u64,
    /// Bumped each time a job ends (see `Entry::finished_tick`).
    finish_counter: u64,
    /// Job tmp dirs that could not be deleted yet (Windows handles); retried by `sweep_tmp`.
    leftovers: Vec<PathBuf>,
}

impl Inner {
    /// Marks `id` as ended now (order for eviction) and drops its secrets.
    fn end(&mut self, id: &JobId) {
        self.finish_counter += 1;
        let tick = self.finish_counter;
        if let Some(e) = self.jobs.get_mut(id) {
            e.ended(tick);
        }
    }

    /// Drops the oldest finished jobs beyond [`MAX_FINISHED_JOBS`]; active ones are never
    /// touched. Returns the evicted ids.
    fn evict_finished(&mut self) -> Vec<JobId> {
        let mut done: Vec<(u64, JobId)> = self
            .jobs
            .values()
            .filter(|e| e.job.stage.is_terminal())
            .map(|e| (e.finished_tick, e.job.id.clone()))
            .collect();
        if done.len() <= MAX_FINISHED_JOBS {
            return Vec::new();
        }
        done.sort();
        let extra = done.len() - MAX_FINISHED_JOBS;
        done.into_iter()
            .take(extra)
            .map(|(_, id)| {
                self.jobs.remove(&id);
                id
            })
            .collect()
    }
}

enum Outcome {
    Done(Box<Preset>),
    Canceled,
    Failed(JobError),
}

pub struct JobManager {
    env: Arc<dyn JobEnv>,
    inner: Mutex<Inner>,
    me: Weak<JobManager>,
    /// ymd is quitting: stop starting jobs, keep the tmp dirs and rows of interrupted ones.
    exiting: AtomicBool,
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn cmd_err(code: ErrorCode, detail: impl Into<String>) -> anyhow::Error {
    anyhow::Error::new(CommandError::new(code, detail))
}

fn io_job_error(e: &std::io::Error, what: &Path) -> JobError {
    let code = match (e.kind(), e.raw_os_error()) {
        (std::io::ErrorKind::PermissionDenied, _) => ErrorCode::PermissionDenied,
        (_, Some(28)) if cfg!(unix) => ErrorCode::DiskFull,
        (_, Some(112)) if cfg!(windows) => ErrorCode::DiskFull,
        _ => ErrorCode::Unknown,
    };
    JobError {
        code,
        detail: format!("{}: {e}", what.display()),
    }
}

/// Request override → preset folder → per-kind default.
pub fn resolve_output_dir(req: &EnqueueRequest, preset: &Preset, settings: &Settings) -> String {
    let pick = |v: Option<&String>| v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    pick(req.output_dir.as_ref())
        .or_else(|| pick(preset.output_dir.as_ref()))
        .unwrap_or_else(|| match preset.kind {
            MediaKind::Video => settings.video_dir.clone(),
            MediaKind::Audio => settings.audio_dir.clone(),
        })
}

impl JobManager {
    pub fn new(env: Arc<dyn JobEnv>) -> Arc<Self> {
        Arc::new_cyclic(|me| JobManager {
            env,
            inner: Mutex::new(Inner::default()),
            me: me.clone(),
            exiting: AtomicBool::new(false),
        })
    }

    fn is_exiting(&self) -> bool {
        self.exiting.load(Ordering::SeqCst)
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Validates the preset and output dir, creates one queued `Job`, and starts it when a slot frees.
    pub async fn enqueue(self: &Arc<Self>, req: EnqueueRequest) -> anyhow::Result<Job> {
        let mut req = req;
        req.url = req.url.trim().to_string();
        if req.url.is_empty() {
            return Err(cmd_err(ErrorCode::UnsupportedUrl, "empty URL"));
        }
        validate_clip(&req)?;
        let settings = self.env.settings();
        let preset = settings
            .presets
            .iter()
            .find(|p| p.id == req.preset_id)
            .ok_or_else(|| {
                cmd_err(
                    ErrorCode::Unknown,
                    format!("unknown preset: {}", req.preset_id),
                )
            })?;
        let output_dir = resolve_output_dir(&req, preset, &settings);
        if output_dir.trim().is_empty() {
            return Err(cmd_err(ErrorCode::PermissionDenied, "no output folder"));
        }
        let kind = preset.kind;
        let job = self.insert(req, kind, output_dir, None);
        self.pump();
        Ok(job)
    }

    /// Creates the queued `Job` (a new id and number, or the ones of `resumed`), saves its
    /// pending row and emits it. The caller pumps.
    fn insert(
        &self,
        req: EnqueueRequest,
        kind: MediaKind,
        output_dir: String,
        resumed: Option<&PendingJob>,
    ) -> Job {
        let first_seq = self.env.first_seq();
        let concurrency = self.env.settings().concurrency;
        let (job, pending) = {
            let mut g = self.lock();
            if g.limit.is_none() {
                g.limit = Some(concurrency.max(1) as usize);
            }
            let next = *g.next_seq.get_or_insert(first_seq);
            let (id, seq, created_at) = match resumed {
                Some(p) => (p.id.clone(), p.seq, p.created_at.clone()),
                None => (uuid::Uuid::new_v4().to_string(), next, now()),
            };
            g.next_seq = Some(next.max(seq + 1));
            let job = Job {
                id,
                seq,
                url: req.url.clone(),
                title: req.title.clone(),
                thumbnail: req.thumbnail.clone(),
                preset_id: req.preset_id.clone(),
                kind,
                stage: JobStage::Queued,
                progress: 0.0,
                downloaded_bytes: None,
                total_bytes: None,
                speed: None,
                eta: None,
                output_dir,
                filepath: None,
                error: None,
                playlist_index: None,
                playlist_count: None,
                created_at,
                finished_at: None,
                clip: req.clip,
            };
            let pending = pending_of(&job, &req);
            g.jobs.insert(
                job.id.clone(),
                Entry {
                    job: job.clone(),
                    req,
                    cancel: Arc::new(Notify::new()),
                    cancel_requested: false,
                    last_emit: None,
                    started: None,
                    stage_since: None,
                    finished_tick: 0,
                    secret_dropped: false,
                },
            );
            (job, pending)
        };
        // SQLite I/O outside the jobs lock; the job only becomes startable once its row exists.
        self.env.pending_save(&pending);
        let queued = {
            let mut g = self.lock();
            let queued = g
                .jobs
                .get(&job.id)
                .is_some_and(|e| e.job.stage == JobStage::Queued);
            if queued {
                g.queue.push_back(job.id.clone());
            }
            queued
        };
        if queued {
            self.env.emit(&job);
        } else {
            // Canceled while its row was being written: forget the row again.
            self.env.pending_delete(&job.id);
        }
        job
    }

    /// Re-queues downloads left unfinished by a previous session, with their id (so yt-dlp
    /// picks up the `.part` files in `tmp/<id>`) and number. Skips the ones that need a secret
    /// and the ones already in the list. Does not check the preset: a deleted one fails the
    /// job visibly when it starts.
    pub async fn resume(self: &Arc<Self>, pending: Vec<PendingJob>) -> Vec<Job> {
        let mut out = Vec::new();
        for p in pending {
            if p.needs_secret || self.lock().jobs.contains_key(&p.id) {
                continue;
            }
            let req = EnqueueRequest {
                url: p.url.clone(),
                preset_id: p.preset_id.clone(),
                playlist_items: p.playlist_items.clone(),
                output_dir: Some(p.output_dir.clone()),
                video_password: None,
                twofactor: None,
                title: p.title.clone(),
                thumbnail: p.thumbnail.clone(),
                clip: p.clip,
            };
            out.push(self.insert(req, p.kind, p.output_dir.clone(), Some(&p)));
        }
        self.pump();
        out
    }

    /// Ids of jobs in this session's list (resumed rows must not be discarded under them).
    pub async fn ids(&self) -> HashSet<JobId> {
        self.lock().jobs.keys().cloned().collect()
    }

    /// Ids of jobs queued or running.
    pub fn active_ids(&self) -> HashSet<JobId> {
        self.lock()
            .jobs
            .values()
            .filter(|e| !e.job.stage.is_terminal())
            .map(|e| e.job.id.clone())
            .collect()
    }

    /// Periodic clean-up of `tmp_dir`: retries the job dirs that could not be deleted when
    /// their job ended, then removes every job dir that belongs neither to an active job nor
    /// to a resumable download (`pending`, read after the active ids so a job queued
    /// meanwhile is covered by its row). Returns how many dirs went.
    pub fn sweep_tmp(&self, pending: impl FnOnce() -> HashSet<JobId>) -> usize {
        let leftovers = std::mem::take(&mut self.lock().leftovers);
        let mut removed = 0;
        let mut still = Vec::new();
        for dir in leftovers {
            match std::fs::remove_dir_all(&dir) {
                Ok(()) => removed += 1,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => still.push(dir),
            }
        }
        self.lock().leftovers.extend(still);
        let mut keep = self.active_ids();
        keep.extend(pending());
        removed + sweep_orphan_tmp(&self.env.tmp_dir(), &keep)
    }

    /// Job tmp dirs waiting for a retry of their deletion.
    pub fn leftover_dirs(&self) -> Vec<PathBuf> {
        self.lock().leftovers.clone()
    }

    /// ymd is quitting: start nothing more and kill the running downloads, keeping their tmp
    /// dirs and pending rows so they can be resumed. Waits (bounded) for the processes to go.
    pub async fn shutdown(&self) {
        if self.exiting.swap(true, Ordering::SeqCst) {
            return;
        }
        {
            let mut g = self.lock();
            for e in g.jobs.values_mut() {
                if !e.job.stage.is_terminal() && e.job.stage != JobStage::Queued {
                    e.cancel_requested = true;
                    e.cancel.notify_one();
                }
            }
        }
        let deadline = Instant::now() + Duration::from_secs(5);
        while self.lock().running > 0 && Instant::now() < deadline {
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
    }

    /// Starts queued jobs while there are free slots.
    fn pump(&self) {
        if self.is_exiting() {
            return;
        }
        let mut started = Vec::new();
        {
            let mut g = self.lock();
            if g.start_at.is_some_and(|t| chrono::Utc::now() < t) {
                return;
            }
            let limit = g.limit.unwrap_or(1).max(1);
            while g.running < limit {
                let Some(id) = g.queue.pop_front() else { break };
                let Some(entry) = g.jobs.get_mut(&id) else {
                    continue;
                };
                if entry.job.stage != JobStage::Queued {
                    continue;
                }
                entry.job.stage = JobStage::Downloading;
                let now = Instant::now();
                entry.last_emit = Some(now);
                entry.started = Some(now);
                entry.stage_since = Some(now);
                started.push(entry.job.clone());
                g.running += 1;
            }
        }
        for job in started {
            self.env.emit(&job);
            match self.me.upgrade() {
                Some(me) => {
                    tokio::spawn(me.run(job.id));
                }
                None => self.lock().running -= 1,
            }
        }
    }

    async fn run(self: Arc<Self>, id: JobId) {
        let span = {
            let g = self.lock();
            let (preset, kind) = g
                .jobs
                .get(&id)
                .map(|e| (e.job.preset_id.clone(), kind_name(e.job.kind)))
                .unwrap_or_default();
            tracing::info_span!("job", id = %id, preset = %preset, kind = kind)
        };
        async move {
            // Frees the slot (and fails the job) even if something below panics.
            let _guard = RunGuard {
                mgr: self.clone(),
                id: id.clone(),
            };
            tracing::info!("job started");
            let outcome = AssertUnwindSafe(self.execute(&id))
                .catch_unwind()
                .await
                .unwrap_or_else(|panic| Outcome::Failed(panic_error(panic.as_ref())));
            // Interrupted by ymd quitting: keep `tmp/<id>` (the `.part` files) and the pending row.
            let keep = self.is_exiting() && !matches!(outcome, Outcome::Done(_));
            if !keep {
                let dir = self.env.tmp_dir().join(&id);
                if !remove_dir_retrying(&dir).await {
                    self.lock().leftovers.push(dir);
                }
            }
            if let Err(panic) =
                std::panic::catch_unwind(AssertUnwindSafe(|| self.finish(&id, outcome, keep)))
            {
                tracing::error!(detail = %panic_error(panic.as_ref()).detail, "job finish failed");
            }
        }
        .instrument(span)
        .await
    }

    async fn execute(&self, id: &JobId) -> Outcome {
        let (req, output_dir, cancel) = {
            let g = self.lock();
            let Some(e) = g.jobs.get(id) else {
                return Outcome::Canceled;
            };
            if e.cancel_requested {
                return Outcome::Canceled;
            }
            (e.req.clone(), e.job.output_dir.clone(), e.cancel.clone())
        };
        let settings = self.env.settings();
        let Some(preset) = settings
            .presets
            .iter()
            .find(|p| p.id == req.preset_id)
            .cloned()
        else {
            return Outcome::Failed(JobError {
                code: ErrorCode::Unknown,
                detail: format!("unknown preset: {}", req.preset_id),
            });
        };
        let tools = self.env.tools().await;
        let Some(ytdlp) = tools.ytdlp.clone() else {
            return Outcome::Failed(JobError {
                code: ErrorCode::BinaryMissing,
                detail: "yt-dlp is not installed".into(),
            });
        };
        let tmp_dir = self.env.tmp_dir().join(id);
        let output_dir = PathBuf::from(output_dir);
        for dir in [&tmp_dir, &output_dir] {
            if let Err(e) = std::fs::create_dir_all(dir) {
                return Outcome::Failed(io_job_error(&e, dir));
            }
        }
        let archive_file = settings
            .use_download_archive
            .then(|| self.env.archive_file());
        // yt-dlp rewrites the `--cookies` jar on exit: give it a copy inside the job's tmp dir
        // (removed with it) so it never clobbers cookies synced while the job ran.
        let (auth_args, _jar) =
            match crate::auth::cookies::ephemeral_args(&self.env.auth_args(&req), &tmp_dir) {
                Ok(v) => v,
                Err(e) => {
                    return Outcome::Failed(JobError {
                        code: e.code,
                        detail: e.detail,
                    })
                }
            };
        let argv = args::download_args(&args::DownloadSpec {
            url: &req.url,
            preset: &preset,
            tools: &tools,
            output_dir,
            tmp_dir,
            filename_template: &settings.filename_template,
            playlist_items: req.playlist_items.as_deref(),
            archive_file,
            use_aria2c: settings.use_aria2c,
            limit_rate_mbps: settings.limit_rate_mbps,
            clip: req.clip,
            network: &settings.network,
            auth_args,
        });
        drop(req);

        if self.lock().jobs.get(id).is_none_or(|e| e.cancel_requested) {
            return Outcome::Canceled;
        }
        let mut child = match process::command(&ytdlp)
            .args(&argv)
            .envs(args::child_env(&tools))
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                let mut err = io_job_error(&e, &ytdlp);
                if e.kind() == std::io::ErrorKind::NotFound {
                    err.code = ErrorCode::BinaryMissing;
                }
                return Outcome::Failed(err);
            }
        };

        let (tx, mut rx) = mpsc::unbounded_channel::<(bool, String)>();
        if let Some(out) = child.stdout.take() {
            read_lines(out, false, tx.clone());
        }
        if let Some(err) = child.stderr.take() {
            read_lines(err, true, tx.clone());
        }
        drop(tx);

        let mut tail: VecDeque<String> = VecDeque::with_capacity(STDERR_TAIL);
        loop {
            tokio::select! {
                biased;
                _ = cancel.notified() => {
                    process::kill_tree(&mut child).await;
                    return Outcome::Canceled;
                }
                msg = rx.recv() => match msg {
                    Some((is_stderr, line)) => match progress::parse_line(&line) {
                        Some(ev) => self.apply(id, ev),
                        None if is_stderr && !line.trim().is_empty() => {
                            if tail.len() == STDERR_TAIL {
                                tail.pop_front();
                            }
                            tail.push_back(line);
                        }
                        None => {}
                    },
                    None => break,
                }
            }
        }
        let status = tokio::select! {
            biased;
            _ = cancel.notified() => {
                process::kill_tree(&mut child).await;
                return Outcome::Canceled;
            }
            s = child.wait() => s,
        };
        match status {
            Ok(s) if s.success() => Outcome::Done(Box::new(preset)),
            Ok(s) => {
                let stderr = tail.into_iter().collect::<Vec<_>>().join("\n");
                let mut err = errors::to_job_error(&stderr);
                if err.detail.is_empty() {
                    err.detail = format!("yt-dlp exited with {s}");
                }
                Outcome::Failed(err)
            }
            Err(e) => Outcome::Failed(JobError {
                code: ErrorCode::Unknown,
                detail: e.to_string(),
            }),
        }
    }

    /// Applies one parsed event and emits (throttled unless the change is significant).
    fn apply(&self, id: &JobId, ev: Event) {
        let mut stage_ended: Option<(JobStage, u64)> = None;
        let emit = {
            let mut g = self.lock();
            let Some(e) = g.jobs.get_mut(id) else { return };
            if e.cancel_requested || e.job.stage.is_terminal() {
                return;
            }
            let before = e.job.stage;
            let job = &mut e.job;
            let mut force = false;
            match ev {
                Event::Progress {
                    stage,
                    downloaded,
                    total,
                    speed,
                    eta,
                    fraction,
                } => {
                    force |= job.stage != stage;
                    job.stage = stage;
                    if let Some(f) = fraction {
                        job.progress = f;
                    }
                    job.downloaded_bytes = downloaded.or(job.downloaded_bytes);
                    job.total_bytes = total.or(job.total_bytes);
                    job.speed = speed;
                    job.eta = eta;
                }
                Event::Stage(stage) => {
                    force |= job.stage != stage;
                    job.stage = stage;
                    job.speed = None;
                    job.eta = None;
                }
                Event::File(path) => {
                    force = true;
                    job.filepath = Some(path);
                }
                Event::Title(title) => {
                    force |= job.title.as_deref() != Some(title.as_str());
                    job.title = Some(title);
                }
                Event::PlaylistItem { index, count } => {
                    if job.playlist_index != Some(index) || job.playlist_count != Some(count) {
                        force = true;
                        job.progress = 0.0;
                        job.downloaded_bytes = None;
                        job.total_bytes = None;
                    }
                    job.playlist_index = Some(index);
                    job.playlist_count = Some(count);
                }
            }
            if e.job.stage != before {
                let since = e.stage_since.replace(Instant::now());
                stage_ended = Some((before, since.map_or(0, elapsed_ms)));
            }
            let due = e.last_emit.is_none_or(|t| t.elapsed() >= EMIT_INTERVAL);
            if force || due {
                e.last_emit = Some(Instant::now());
                Some(e.job.clone())
            } else {
                None
            }
        };
        if let Some((stage, duration_ms)) = stage_ended {
            tracing::info!(
                stage = stage_name(stage),
                duration_ms,
                outcome = "ok",
                "{MSG_STAGE}"
            );
        }
        if let Some(job) = emit {
            self.env.emit(&job);
        }
    }

    fn finish(&self, id: &JobId, outcome: Outcome, keep_pending: bool) {
        let (job, preset, last_stage, stage_ms, total_ms) = {
            let mut g = self.lock();
            let Some(e) = g.jobs.get_mut(id) else { return };
            let last_stage = e.job.stage;
            let stage_ms = e.stage_since.take().map_or(0, elapsed_ms);
            let total_ms = e.started.map_or(0, elapsed_ms);
            let job = &mut e.job;
            job.speed = None;
            job.eta = None;
            job.finished_at = Some(now());
            let preset = match outcome {
                Outcome::Done(p) => {
                    job.stage = JobStage::Done;
                    job.progress = 1.0;
                    Some(p)
                }
                Outcome::Canceled => {
                    job.stage = JobStage::Canceled;
                    None
                }
                Outcome::Failed(mut err) => {
                    job.stage = JobStage::Error;
                    err.detail = errors::cap_detail(&err.detail);
                    job.error = Some(err);
                    None
                }
            };
            e.last_emit = Some(Instant::now());
            let snapshot = (e.job.clone(), preset, last_stage, stage_ms, total_ms);
            g.end(id);
            snapshot
        };
        let outcome = stage_name(job.stage);
        tracing::info!(
            stage = stage_name(last_stage),
            duration_ms = stage_ms,
            outcome = if job.stage == JobStage::Done {
                "ok"
            } else {
                outcome
            },
            "{MSG_STAGE}"
        );
        match &job.error {
            Some(err) => tracing::warn!(
                duration_ms = total_ms,
                outcome,
                error_code = %wire_name(&err.code),
                detail = %truncate(&err.detail, 300),
                "{MSG_JOB}"
            ),
            None => tracing::info!(duration_ms = total_ms, outcome, "{MSG_JOB}"),
        }
        if let Some(p) = preset {
            self.env.completed(&job, &p);
        }
        self.env.emit(&job);
        if !keep_pending {
            self.env.pending_delete(id);
        }
        self.evict();
    }

    /// Evicts the oldest finished jobs beyond [`MAX_FINISHED_JOBS`] and tells the UI.
    fn evict(&self) {
        let evicted = self.lock().evict_finished();
        for id in &evicted {
            self.env.removed(id);
        }
    }

    pub async fn cancel(&self, id: &JobId) -> anyhow::Result<()> {
        let queued = {
            let mut g = self.lock();
            let Inner { jobs, queue, .. } = &mut *g;
            let e = jobs
                .get_mut(id)
                .ok_or_else(|| cmd_err(ErrorCode::Unknown, format!("unknown job: {id}")))?;
            if e.job.stage.is_terminal() {
                return Ok(());
            }
            if e.job.stage == JobStage::Queued {
                queue.retain(|q| q != id);
                e.job.stage = JobStage::Canceled;
                e.job.finished_at = Some(now());
                let job = e.job.clone();
                g.end(id);
                Some(job)
            } else {
                e.cancel_requested = true;
                e.cancel.notify_one();
                None
            }
        };
        if let Some(job) = queued {
            self.env.pending_delete(id);
            self.env.emit(&job);
            self.evict();
        }
        Ok(())
    }

    pub async fn retry(self: &Arc<Self>, id: &JobId) -> anyhow::Result<Job> {
        let req = {
            let g = self.lock();
            let e = g
                .jobs
                .get(id)
                .ok_or_else(|| cmd_err(ErrorCode::Unknown, format!("unknown job: {id}")))?;
            if !e.job.stage.is_terminal() {
                return Err(cmd_err(ErrorCode::Unknown, "job is still active"));
            }
            if e.secret_dropped {
                // Like a pending row with `needs_secret`: the secret is gone, ask for it again.
                return Err(cmd_err(
                    ErrorCode::LoginRequired,
                    "the video password or 2FA code is not kept after a download ends; add the link again",
                ));
            }
            e.req.clone()
        };
        self.enqueue(req).await
    }

    /// Removes a terminal job from the list (does not touch files).
    pub async fn remove(&self, id: &JobId) -> anyhow::Result<()> {
        let mut g = self.lock();
        let e = g
            .jobs
            .get(id)
            .ok_or_else(|| cmd_err(ErrorCode::Unknown, format!("unknown job: {id}")))?;
        if !e.job.stage.is_terminal() {
            return Err(cmd_err(
                ErrorCode::Unknown,
                "cancel the job before removing it",
            ));
        }
        g.jobs.remove(id);
        drop(g);
        self.env.pending_delete(id);
        Ok(())
    }

    pub async fn clear_finished(&self) -> Vec<JobId> {
        let mut g = self.lock();
        let mut done: Vec<(u64, JobId)> = g
            .jobs
            .values()
            .filter(|e| e.job.stage.is_terminal())
            .map(|e| (e.job.seq, e.job.id.clone()))
            .collect();
        done.sort();
        for (_, id) in &done {
            g.jobs.remove(id);
        }
        done.into_iter().map(|(_, id)| id).collect()
    }

    pub async fn list(&self) -> Vec<Job> {
        let g = self.lock();
        let mut jobs: Vec<Job> = g.jobs.values().map(|e| e.job.clone()).collect();
        jobs.sort_by_key(|j| j.seq);
        jobs
    }

    /// Accession number the next enqueued job will get.
    pub async fn next_seq(&self) -> u64 {
        let first = self.env.first_seq();
        self.lock().next_seq.unwrap_or(first)
    }

    /// Jobs not yet finished (queued or running).
    pub async fn active_count(&self) -> usize {
        self.lock()
            .jobs
            .values()
            .filter(|e| !e.job.stage.is_terminal())
            .count()
    }

    /// Apply a new concurrency limit to queued jobs.
    pub async fn set_concurrency(&self, n: u32) {
        self.lock().limit = Some(n.max(1) as usize);
        self.pump();
    }

    /// When the queue starts (`None` = no schedule).
    pub fn start_at(&self) -> Option<chrono::DateTime<chrono::Utc>> {
        self.lock().start_at
    }

    /// Holds queued jobs until `at` (running jobs are untouched), or clears the schedule and
    /// starts queued jobs now with `None`. An instant that already passed counts as `None`.
    /// Replaces any previous schedule and its timer.
    pub fn set_start_at(&self, at: Option<chrono::DateTime<chrono::Utc>>) {
        let at = at.filter(|t| *t > chrono::Utc::now());
        let gen = {
            let mut g = self.lock();
            g.schedule_gen += 1;
            g.start_at = at;
            g.schedule_gen
        };
        self.env.schedule_changed(at.map(rfc3339).as_deref());
        match at {
            None => self.pump(),
            Some(t) => {
                let me = self.me.clone();
                tokio::spawn(async move {
                    loop {
                        let left = (t - chrono::Utc::now()).to_std().unwrap_or_default();
                        if left.is_zero() {
                            break;
                        }
                        tokio::time::sleep(left.min(SCHEDULE_TICK)).await;
                        match me.upgrade() {
                            Some(m) if m.lock().schedule_gen == gen => {}
                            _ => return,
                        }
                    }
                    if let Some(m) = me.upgrade() {
                        m.schedule_reached(gen);
                    }
                });
            }
        }
    }

    /// Timer of generation `gen` fired: clear the schedule (unless superseded) and start jobs.
    fn schedule_reached(&self, gen: u64) {
        {
            let mut g = self.lock();
            if g.schedule_gen != gen {
                return;
            }
            g.start_at = None;
        }
        self.env.schedule_changed(None);
        self.pump();
    }
}

/// At most `max` characters (logs keep error lines short).
fn truncate(s: &str, max: usize) -> String {
    match s.char_indices().nth(max) {
        Some((i, _)) => format!("{}…", &s[..i]),
        None => s.to_string(),
    }
}

/// Splits a byte stream into lines on `\n` **and** `\r` (yt-dlp, ffmpeg and aria2c redraw
/// progress with a bare `\r`), keeping at most [`MAX_LINE_BYTES`] of each line: the rest of
/// an over-long line is dropped, so a stream without separators can't grow memory. Empty
/// lines are skipped.
#[derive(Default)]
struct LineSplitter {
    buf: Vec<u8>,
    /// The current line already reached the cap: drop bytes until its end.
    overflow: bool,
}

impl LineSplitter {
    fn push(&mut self, bytes: &[u8], out: &mut impl FnMut(String)) {
        for &b in bytes {
            if b == b'\n' || b == b'\r' {
                self.flush(out);
            } else if self.buf.len() < MAX_LINE_BYTES {
                self.buf.push(b);
            } else {
                self.overflow = true;
            }
        }
    }

    /// Ends the current line (at a separator or EOF).
    fn flush(&mut self, out: &mut impl FnMut(String)) {
        if !self.buf.is_empty() {
            out(String::from_utf8_lossy(&self.buf).into_owned());
        }
        self.buf.clear();
        self.overflow = false;
    }
}

/// Forwards lines (lossy UTF-8, see [`LineSplitter`]) to the job loop until EOF.
fn read_lines<R>(stream: R, is_stderr: bool, tx: mpsc::UnboundedSender<(bool, String)>)
where
    R: AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(forward_lines(stream, is_stderr, tx));
}

async fn forward_lines<R>(mut stream: R, is_stderr: bool, tx: mpsc::UnboundedSender<(bool, String)>)
where
    R: AsyncRead + Unpin,
{
    let mut splitter = LineSplitter::default();
    let mut chunk = vec![0u8; 8 * 1024];
    let mut open = true;
    let mut send = |line: String| {
        if open && tx.send((is_stderr, line)).is_err() {
            open = false;
        }
    };
    loop {
        match stream.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(n) => splitter.push(&chunk[..n], &mut send),
        }
    }
    splitter.flush(&mut send);
}

/// A panic payload as a job error (the message only; it never holds a secret).
fn panic_error(panic: &(dyn std::any::Any + Send)) -> JobError {
    let msg = panic
        .downcast_ref::<&str>()
        .map(|s| s.to_string())
        .or_else(|| panic.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "unknown panic".into());
    JobError {
        code: ErrorCode::Unknown,
        detail: errors::cap_detail(&format!("internal error: {msg}")),
    }
}

/// Held by a running job: when it goes (normally or while unwinding from a panic) the slot is
/// freed and, if the job never reached a terminal state, it is failed and its row forgotten.
struct RunGuard {
    mgr: Arc<JobManager>,
    id: JobId,
}

impl Drop for RunGuard {
    fn drop(&mut self) {
        let mgr = &self.mgr;
        let failed = {
            let mut g = mgr.lock();
            g.running = g.running.saturating_sub(1);
            let job = g.jobs.get_mut(&self.id).and_then(|e| {
                if e.job.stage.is_terminal() {
                    return None;
                }
                e.job.stage = JobStage::Error;
                e.job.speed = None;
                e.job.eta = None;
                e.job.finished_at = Some(now());
                e.job.error = Some(JobError {
                    code: ErrorCode::Unknown,
                    detail: "internal error: the download stopped unexpectedly".into(),
                });
                Some(e.job.clone())
            });
            if job.is_some() {
                g.end(&self.id);
            }
            job
        };
        // Nothing here may panic again (a panic while unwinding aborts the process).
        let _ = std::panic::catch_unwind(AssertUnwindSafe(|| {
            if let Some(job) = failed {
                mgr.env.emit(&job);
                if !mgr.is_exiting() {
                    mgr.env.pending_delete(&self.id);
                }
                mgr.evict();
            }
            if tokio::runtime::Handle::try_current().is_ok() {
                mgr.pump();
            }
        }));
    }
}

/// Removes a job's tmp dir. Windows may keep handles open briefly after a kill, so retry.
/// `false` when the dir is still there (the caller remembers it for `sweep_tmp`).
async fn remove_dir_retrying(dir: &Path) -> bool {
    for _ in 0..20 {
        match std::fs::remove_dir_all(dir) {
            Ok(()) => return true,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return true,
            Err(_) => tokio::time::sleep(Duration::from_millis(100)).await,
        }
    }
    log::warn!("could not remove {}; will retry later", dir.display());
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{AudioFormat, AudioOptions, PostProcess, VideoContainer, VideoOptions};

    fn preset(kind: MediaKind, dir: Option<&str>) -> Preset {
        Preset {
            id: "p".into(),
            name: "p".into(),
            kind,
            video: VideoOptions {
                max_height: None,
                container: VideoContainer::Any,
            },
            audio: AudioOptions {
                format: AudioFormat::Best,
                quality: "0".into(),
            },
            postprocess: PostProcess {
                embed_thumbnail: false,
                embed_metadata: false,
                embed_subs: false,
                sub_langs: String::new(),
                sponsorblock_remove: vec![],
                split_artist_title: false,
                square_cover: false,
                normalize_volume: false,
            },
            output_dir: dir.map(String::from),
            builtin: false,
        }
    }

    fn req(dir: Option<&str>) -> EnqueueRequest {
        EnqueueRequest {
            url: "u".into(),
            preset_id: "p".into(),
            playlist_items: None,
            output_dir: dir.map(String::from),
            video_password: None,
            twofactor: None,
            title: None,
            thumbnail: None,
            clip: None,
        }
    }

    fn split(chunks: &[&[u8]]) -> Vec<String> {
        let mut lines = Vec::new();
        let mut s = LineSplitter::default();
        for c in chunks {
            s.push(c, &mut |l| lines.push(l));
        }
        s.flush(&mut |l| lines.push(l));
        lines
    }

    #[test]
    fn lines_split_on_cr_and_lf() {
        assert_eq!(
            split(&[b"a\r\nb\rc\n\n\rd"]),
            vec!["a", "b", "c", "d"],
            "\\r, \\n and \\r\\n end lines; empty ones are skipped; EOF ends the last"
        );
        // A line split across reads is joined.
        assert_eq!(split(&[b"YMD|{\"a\"", b":1}\r"]), vec!["YMD|{\"a\":1}"]);
        assert!(split(&[b""]).is_empty());
    }

    #[test]
    fn over_long_lines_are_capped() {
        let long = vec![b'x'; MAX_LINE_BYTES * 3 + 5];
        let lines = split(&[&long[..1000], &long[1000..], b"\rnext\n"]);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].len(), MAX_LINE_BYTES);
        assert_eq!(lines[1], "next");
        // Without any separator memory stays bounded and EOF delivers the capped line.
        let lines = split(&[&long]);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].len(), MAX_LINE_BYTES);
    }

    #[tokio::test]
    async fn forwarded_cr_frames_parse_as_progress() {
        let frame = |p: u32| {
            format!(
                "YMD|{{\"status\":\"downloading\",\"downloaded_bytes\":{p},\"total_bytes\":100}}\r"
            )
        };
        let mut stream = format!("{}{}", frame(10), frame(60)).into_bytes();
        stream.extend(vec![b'z'; MAX_LINE_BYTES * 2]);
        stream.extend_from_slice(b"\r\n");
        stream.extend_from_slice(frame(90).as_bytes());
        let (tx, mut rx) = mpsc::unbounded_channel();
        forward_lines(&stream[..], true, tx).await;
        let mut lines = Vec::new();
        while let Some((is_stderr, l)) = rx.recv().await {
            assert!(is_stderr);
            lines.push(l);
        }
        assert_eq!(lines.len(), 4);
        assert_eq!(lines[2].len(), MAX_LINE_BYTES);
        let fractions: Vec<_> = [&lines[0], &lines[1], &lines[3]]
            .iter()
            .map(|l| match progress::parse_line(l) {
                Some(Event::Progress { fraction, .. }) => fraction,
                other => panic!("{l}: {other:?}"),
            })
            .collect();
        assert_eq!(fractions, vec![Some(0.1), Some(0.6), Some(0.9)]);
    }

    #[test]
    fn panic_payloads_become_job_errors() {
        let e = panic_error(&"boom");
        assert_eq!(e.code, ErrorCode::Unknown);
        assert_eq!(e.detail, "internal error: boom");
        assert_eq!(
            panic_error(&String::from("bang")).detail,
            "internal error: bang"
        );
        assert_eq!(panic_error(&42u8).detail, "internal error: unknown panic");
    }

    #[test]
    fn truncate_keeps_short_text() {
        assert_eq!(truncate("abc", 5), "abc");
        assert_eq!(truncate("ñandú", 2), "ña…");
    }

    #[test]
    fn output_dir_precedence() {
        let settings_json = serde_json::json!({
            "language": "system",
            "theme": {"mode": "system", "accent": null, "density": "comfortable", "radius": "soft", "fontScale": 1.0},
            "videoDir": "V", "audioDir": "A", "askEachTime": false, "filenameTemplate": "",
            "concurrency": 2, "binDir": null, "ytdlpChannel": "nightly", "autoUpdate": true,
            "useDownloadArchive": false, "useAria2c": false, "cookies": {"kind": "none"},
            "presets": [], "defaultPresetId": "p", "onboarded": true
        });
        let s: Settings = serde_json::from_value(settings_json).unwrap();
        assert_eq!(
            resolve_output_dir(&req(Some("R")), &preset(MediaKind::Video, Some("P")), &s),
            "R"
        );
        assert_eq!(
            resolve_output_dir(&req(Some(" ")), &preset(MediaKind::Video, Some("P")), &s),
            "P"
        );
        assert_eq!(
            resolve_output_dir(&req(None), &preset(MediaKind::Video, None), &s),
            "V"
        );
        assert_eq!(
            resolve_output_dir(&req(None), &preset(MediaKind::Audio, Some("")), &s),
            "A"
        );
    }
}
