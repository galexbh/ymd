//! Download queue. Owner: B.
//!
//! - bounded concurrency: a FIFO queue plus a scheduler (`pump`) that starts jobs while fewer
//!   than `limit` are running; `set_concurrency` resizes the limit and starts queued jobs;
//! - one yt-dlp child per job; stdout **and** stderr are parsed with `ytdlp::progress` (yt-dlp
//!   writes postprocessor progress to stderr in quiet mode), the last non-marker stderr lines are
//!   kept for error classification;
//! - `Job` updates go to the `JobEnv` throttled to ~4/s per job; stage changes, title / file /
//!   playlist-item changes and terminal states are always sent;
//! - cancel kills the process tree (`process::kill_tree`) and removes the job's tmp dir (where
//!   yt-dlp keeps `*.part` / `*.ytdl` files because of `-P temp:`);
//! - retry re-enqueues a terminal job with the same request (new id and seq);
//! - transient secrets in `EnqueueRequest` (video password / 2FA) stay in this in-memory map
//!   only; they are never copied into `Job` or emitted.

use crate::deps::Tools;
use crate::model::{
    CommandError, EnqueueRequest, ErrorCode, Job, JobError, JobId, JobStage, MediaKind, Preset,
    Settings,
};
use crate::process;
use crate::ytdlp::progress::{self, Event};
use crate::ytdlp::{args, errors};
use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex, MutexGuard, Weak};
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::sync::{mpsc, Notify};

/// Minimum time between two throttled progress emissions of the same job (≤ 4/s).
pub const EMIT_INTERVAL: Duration = Duration::from_millis(250);
/// stderr lines kept for the error detail / classification.
pub const STDERR_TAIL: usize = 50;

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
    /// First accession number of this session (numbers continue across sessions).
    fn first_seq(&self) -> u64 {
        1
    }
}

struct Entry {
    job: Job,
    req: EnqueueRequest,
    cancel: Arc<Notify>,
    cancel_requested: bool,
    last_emit: Option<Instant>,
}

#[derive(Default)]
struct Inner {
    jobs: HashMap<JobId, Entry>,
    queue: VecDeque<JobId>,
    running: usize,
    /// Read lazily from settings: `JobManager::new` runs before the app state exists.
    limit: Option<usize>,
    next_seq: Option<u64>,
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
        })
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
        let first_seq = self.env.first_seq();
        let job = {
            let mut g = self.lock();
            if g.limit.is_none() {
                g.limit = Some(settings.concurrency.max(1) as usize);
            }
            let seq = *g.next_seq.get_or_insert(first_seq);
            g.next_seq = Some(seq + 1);
            let job = Job {
                id: uuid::Uuid::new_v4().to_string(),
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
                created_at: now(),
                finished_at: None,
            };
            g.jobs.insert(
                job.id.clone(),
                Entry {
                    job: job.clone(),
                    req,
                    cancel: Arc::new(Notify::new()),
                    cancel_requested: false,
                    last_emit: None,
                },
            );
            g.queue.push_back(job.id.clone());
            job
        };
        self.env.emit(&job);
        self.pump();
        Ok(job)
    }

    /// Starts queued jobs while there are free slots.
    fn pump(&self) {
        let mut started = Vec::new();
        {
            let mut g = self.lock();
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
                entry.last_emit = Some(Instant::now());
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
        let outcome = self.execute(&id).await;
        remove_dir_retrying(&self.env.tmp_dir().join(&id)).await;
        self.finish(&id, outcome);
        {
            let mut g = self.lock();
            g.running = g.running.saturating_sub(1);
        }
        self.pump();
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
            auth_args: self.env.auth_args(&req),
        });
        drop(req);

        if self
            .lock()
            .jobs
            .get(id)
            .map_or(true, |e| e.cancel_requested)
        {
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
        let emit = {
            let mut g = self.lock();
            let Some(e) = g.jobs.get_mut(id) else { return };
            if e.cancel_requested || e.job.stage.is_terminal() {
                return;
            }
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
            let due = e.last_emit.map_or(true, |t| t.elapsed() >= EMIT_INTERVAL);
            if force || due {
                e.last_emit = Some(Instant::now());
                Some(e.job.clone())
            } else {
                None
            }
        };
        if let Some(job) = emit {
            self.env.emit(&job);
        }
    }

    fn finish(&self, id: &JobId, outcome: Outcome) {
        let (job, preset) = {
            let mut g = self.lock();
            let Some(e) = g.jobs.get_mut(id) else { return };
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
                Outcome::Failed(err) => {
                    job.stage = JobStage::Error;
                    job.error = Some(err);
                    None
                }
            };
            e.last_emit = Some(Instant::now());
            (e.job.clone(), preset)
        };
        if let Some(p) = preset {
            self.env.completed(&job, &p);
        }
        self.env.emit(&job);
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
                Some(e.job.clone())
            } else {
                e.cancel_requested = true;
                e.cancel.notify_one();
                None
            }
        };
        if let Some(job) = queued {
            self.env.emit(&job);
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
}

/// Forwards lines (lossy UTF-8, without `\r\n`) to the job loop until EOF.
fn read_lines<R>(stream: R, is_stderr: bool, tx: mpsc::UnboundedSender<(bool, String)>)
where
    R: AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let mut reader = BufReader::new(stream);
        let mut buf = Vec::with_capacity(1024);
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let line = String::from_utf8_lossy(&buf)
                        .trim_end_matches(['\r', '\n'])
                        .to_string();
                    if tx.send((is_stderr, line)).is_err() {
                        break;
                    }
                }
            }
        }
    });
}

/// Removes a job's tmp dir. Windows may keep handles open briefly after a kill, so retry.
async fn remove_dir_retrying(dir: &Path) {
    for _ in 0..20 {
        match std::fs::remove_dir_all(dir) {
            Ok(()) => return,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return,
            Err(_) => tokio::time::sleep(Duration::from_millis(100)).await,
        }
    }
    log::warn!("could not remove {}", dir.display());
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
        }
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
