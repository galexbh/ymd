//! `JobManager` end to end against `fake-ytdlp` (see `tests/support/fake_ytdlp.rs`).
//! Each test picks its scenario through the URL (`fake://<scenario>`), so tests run in parallel.
#![cfg(feature = "test-support")]

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use ymd_lib::deps::Tools;
use ymd_lib::history::History;
use ymd_lib::jobs::{self, JobEnv, JobManager, EMIT_INTERVAL};
use ymd_lib::model::{
    CommandError, EnqueueRequest, ErrorCode, Job, JobId, JobStage, PendingJob, Preset, Settings,
};

const FAKE: &str = env!("CARGO_BIN_EXE_fake-ytdlp");

struct FakeEnv {
    settings: Mutex<Settings>,
    tools: Tools,
    tmp: PathBuf,
    archive: PathBuf,
    first_seq: u64,
    events: Mutex<Vec<(Instant, Job)>>,
    completed: Mutex<Vec<(Job, String)>>,
    /// Canonical cookies.txt handed over as `--cookies` (cookie source "file").
    cookies: Mutex<Option<PathBuf>>,
    /// Every `schedule_changed` payload, in order.
    schedules: Mutex<Vec<Option<String>>>,
    /// Real history database (on disk) holding the pending rows.
    history: Arc<History>,
}

impl JobEnv for FakeEnv {
    fn settings(&self) -> Settings {
        self.settings.lock().unwrap().clone()
    }
    fn tools(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = Tools> + Send + '_>> {
        Box::pin(async move { self.tools.clone() })
    }
    fn auth_args(&self, req: &EnqueueRequest) -> Vec<String> {
        let mut args: Vec<String> = match &req.video_password {
            Some(p) => vec!["--video-password".into(), p.clone()],
            None => vec![],
        };
        if let Some(c) = self.cookies.lock().unwrap().as_ref() {
            args.push("--cookies".into());
            args.push(c.to_string_lossy().into_owned());
        }
        args
    }
    fn tmp_dir(&self) -> PathBuf {
        self.tmp.clone()
    }
    fn archive_file(&self) -> PathBuf {
        self.archive.clone()
    }
    fn emit(&self, job: &Job) {
        self.events
            .lock()
            .unwrap()
            .push((Instant::now(), job.clone()));
    }
    fn completed(&self, job: &Job, preset: &Preset) {
        self.completed
            .lock()
            .unwrap()
            .push((job.clone(), preset.id.clone()));
    }
    fn first_seq(&self) -> u64 {
        self.first_seq
    }
    fn schedule_changed(&self, start_at: Option<&str>) {
        self.schedules
            .lock()
            .unwrap()
            .push(start_at.map(String::from));
    }
    fn pending_save(&self, pending: &PendingJob) {
        self.history.pending_save(pending).unwrap();
    }
    fn pending_delete(&self, id: &JobId) {
        self.history.pending_delete(id).unwrap();
    }
}

fn settings(root: &Path, concurrency: u32) -> Settings {
    let video = |id: &str, h: u32| {
        serde_json::json!({
            "id": id, "name": id, "kind": "video",
            "video": {"maxHeight": h, "container": "mp4"},
            "audio": {"format": "best", "quality": "0"},
            "postprocess": {"embedThumbnail": true, "embedMetadata": true, "embedSubs": false,
                            "subLangs": "", "sponsorblockRemove": []},
            "outputDir": null, "builtin": true
        })
    };
    serde_json::from_value(serde_json::json!({
        "language": "system",
        "theme": {"mode": "system", "accent": null, "density": "comfortable", "radius": "soft", "fontScale": 1.0},
        "videoDir": root.join("Videos"), "audioDir": root.join("Music"),
        "askEachTime": false, "filenameTemplate": "%(title)s [%(id)s].%(ext)s",
        "concurrency": concurrency, "binDir": null, "ytdlpChannel": "nightly", "autoUpdate": true,
        "useDownloadArchive": false, "useAria2c": false, "cookies": {"kind": "none"},
        "presets": [
            video("mp4-1080", 1080),
            {
                "id": "mp3-320", "name": "MP3 320", "kind": "audio",
                "video": {"maxHeight": null, "container": "any"},
                "audio": {"format": "mp3", "quality": "320K"},
                "postprocess": {"embedThumbnail": true, "embedMetadata": true, "embedSubs": false,
                                "subLangs": "", "sponsorblockRemove": []},
                "outputDir": null, "builtin": true
            }
        ],
        "defaultPresetId": "mp4-1080", "onboarded": true
    }))
    .unwrap()
}

struct Harness {
    _dir: tempfile::TempDir,
    root: PathBuf,
    env: Arc<FakeEnv>,
    jobs: Arc<JobManager>,
}

fn harness_with(concurrency: u32, ytdlp: Option<PathBuf>) -> Harness {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_path_buf();
    let env = Arc::new(FakeEnv {
        settings: Mutex::new(settings(&root, concurrency)),
        tools: Tools {
            ytdlp,
            ..Tools::default()
        },
        tmp: root.join("tmp"),
        archive: root.join("archive.txt"),
        first_seq: 41,
        events: Mutex::new(vec![]),
        completed: Mutex::new(vec![]),
        cookies: Mutex::new(None),
        schedules: Mutex::new(vec![]),
        history: Arc::new(History::open(&root.join("history.sqlite3")).unwrap()),
    });
    let jobs = JobManager::new(env.clone());
    Harness {
        _dir: dir,
        root,
        env,
        jobs,
    }
}

fn harness(concurrency: u32) -> Harness {
    harness_with(concurrency, Some(FAKE.into()))
}

fn req(url: &str, preset: &str) -> EnqueueRequest {
    EnqueueRequest {
        url: url.into(),
        preset_id: preset.into(),
        playlist_items: None,
        output_dir: None,
        video_password: None,
        twofactor: None,
        title: None,
        thumbnail: None,
    }
}

impl Harness {
    async fn job(&self, id: &str) -> Job {
        self.jobs
            .list()
            .await
            .into_iter()
            .find(|j| j.id == id)
            .expect("job listed")
    }

    async fn wait<F: Fn(&[Job]) -> bool>(&self, what: &str, pred: F) {
        let deadline = Instant::now() + Duration::from_secs(30);
        loop {
            let jobs = self.jobs.list().await;
            if pred(&jobs) {
                return;
            }
            assert!(
                Instant::now() < deadline,
                "timed out waiting for {what}: {jobs:#?}"
            );
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    }

    async fn wait_terminal(&self, id: &str) -> Job {
        self.wait("terminal", |jobs| {
            jobs.iter().any(|j| j.id == id && j.stage.is_terminal())
        })
        .await;
        self.job(id).await
    }

    fn events_of(&self, id: &str) -> Vec<(Instant, Job)> {
        self.env
            .events
            .lock()
            .unwrap()
            .iter()
            .filter(|(_, j)| j.id == id)
            .cloned()
            .collect()
    }

    /// Highest number of jobs simultaneously running, replaying emissions in order.
    fn max_running(&self) -> usize {
        let mut stages: HashMap<String, JobStage> = HashMap::new();
        let mut max = 0;
        for (_, j) in self.env.events.lock().unwrap().iter() {
            stages.insert(j.id.clone(), j.stage);
            let running = stages
                .values()
                .filter(|s| !s.is_terminal() && **s != JobStage::Queued)
                .count();
            max = max.max(running);
        }
        max
    }
}

fn is_alive(pid: u32) -> bool {
    #[cfg(windows)]
    {
        let out = std::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/NH", "/FO", "CSV"])
            .output()
            .expect("tasklist");
        String::from_utf8_lossy(&out.stdout).contains(&format!("\"{pid}\""))
    }
    #[cfg(unix)]
    {
        std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn success_video_reaches_done_with_file() {
    let h = harness(3);
    let job = h
        .jobs
        .enqueue(req("fake://success", "mp4-1080"))
        .await
        .unwrap();
    assert_eq!(job.stage, JobStage::Queued);
    assert_eq!(job.seq, 41, "seq starts at env.first_seq()");
    assert_eq!(job.output_dir, h.root.join("Videos").to_string_lossy());

    let done = h.wait_terminal(&job.id).await;
    assert_eq!(done.stage, JobStage::Done, "{done:#?}");
    assert_eq!(done.progress, 1.0);
    assert_eq!(done.title.as_deref(), Some("Fake Video"));
    assert!(done.finished_at.is_some() && done.error.is_none());
    let file = PathBuf::from(done.filepath.clone().expect("filepath"));
    assert!(file.exists(), "{file:?}");
    assert_eq!(
        file,
        h.root.join("Videos").join("Fake Video [dQw4w9WgXcQ].mp4")
    );
    assert!(
        !h.root.join("tmp").join(&job.id).exists(),
        "tmp dir removed"
    );

    let completed = h.env.completed.lock().unwrap().clone();
    assert_eq!(completed.len(), 1);
    assert_eq!(completed[0].0.id, job.id);
    assert_eq!(completed[0].1, "mp4-1080");

    let stages: Vec<JobStage> = h.events_of(&job.id).iter().map(|(_, j)| j.stage).collect();
    assert_eq!(stages.first(), Some(&JobStage::Queued));
    assert!(stages.contains(&JobStage::Downloading));
    assert!(stages.contains(&JobStage::Merging));
    assert_eq!(stages.last(), Some(&JobStage::Done));
    assert_eq!(stages.iter().filter(|s| **s == JobStage::Done).count(), 1);

    let second = h
        .jobs
        .enqueue(req("fake://success", "mp4-1080"))
        .await
        .unwrap();
    assert_eq!(second.seq, 42);
    h.wait_terminal(&second.id).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn audio_and_output_dir_override() {
    let h = harness(2);
    let mut r = req("fake://success", "mp3-320");
    let custom = h.root.join("custom out");
    r.output_dir = Some(custom.to_string_lossy().into_owned());
    let job = h.jobs.enqueue(r).await.unwrap();
    let done = h.wait_terminal(&job.id).await;
    assert_eq!(done.stage, JobStage::Done, "{done:#?}");
    let file = PathBuf::from(done.filepath.unwrap());
    assert_eq!(file, custom.join("Fake Video [dQw4w9WgXcQ].mp3"));
    assert!(file.exists());
    assert!(h
        .events_of(&job.id)
        .iter()
        .any(|(_, j)| j.stage == JobStage::Postprocessing));
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn playlist_goes_to_its_folder() {
    let h = harness(2);
    let mut r = req("fake://playlist", "mp3-320");
    r.playlist_items = Some(vec![2, 5, 9]);
    let job = h.jobs.enqueue(r).await.unwrap();
    let done = h.wait_terminal(&job.id).await;
    assert_eq!(done.stage, JobStage::Done, "{done:#?}");
    assert_eq!(
        (done.playlist_index, done.playlist_count),
        (Some(3), Some(3))
    );
    let folder = h.root.join("Music").join("Fake Playlist");
    for (i, n) in [(2, "02"), (5, "05"), (9, "09")] {
        let f = folder.join(format!("{n} - Fake Item {i} [fakeid{i:05}].mp3"));
        assert!(f.exists(), "{f:?}");
    }
    assert_eq!(
        PathBuf::from(done.filepath.unwrap()),
        folder.join("09 - Fake Item 9 [fakeid00009].mp3")
    );
    let items: Vec<_> = h
        .events_of(&job.id)
        .iter()
        .filter_map(|(_, j)| j.playlist_index)
        .collect();
    assert!(items.contains(&1) && items.contains(&2) && items.contains(&3));
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn concurrency_limit_is_respected() {
    let h = harness(2);
    let mut ids = vec![];
    for _ in 0..5 {
        ids.push(
            h.jobs
                .enqueue(req("fake://slow/15", "mp3-320"))
                .await
                .unwrap()
                .id,
        );
    }
    assert_eq!(h.jobs.active_count().await, 5);
    for id in &ids {
        assert_eq!(h.wait_terminal(id).await.stage, JobStage::Done);
    }
    assert_eq!(h.max_running(), 2);
    assert_eq!(h.env.completed.lock().unwrap().len(), 5);
    assert_eq!(h.jobs.active_count().await, 0);
    // FIFO: jobs start in enqueue order.
    let starts: Vec<String> = {
        let ev = h.env.events.lock().unwrap();
        let mut seen = vec![];
        for (_, j) in ev.iter() {
            if j.stage == JobStage::Downloading && !seen.contains(&j.id) {
                seen.push(j.id.clone());
            }
        }
        seen
    };
    assert_eq!(starts, ids);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn raising_concurrency_starts_queued_jobs() {
    let h = harness(1);
    let mut ids = vec![];
    for _ in 0..3 {
        ids.push(
            h.jobs
                .enqueue(req("fake://slow/40", "mp3-320"))
                .await
                .unwrap()
                .id,
        );
    }
    h.wait("first running", |jobs| {
        jobs.iter().filter(|j| j.stage == JobStage::Queued).count() == 2
            && jobs.iter().any(|j| j.stage == JobStage::Downloading)
    })
    .await;
    h.jobs.set_concurrency(3).await;
    h.wait("all running", |jobs| {
        jobs.iter().all(|j| j.stage != JobStage::Queued)
    })
    .await;
    for id in &ids {
        assert_eq!(h.wait_terminal(id).await.stage, JobStage::Done);
    }
    assert_eq!(h.max_running(), 3);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn cancel_kills_tree_and_cleans_tmp() {
    let h = harness(2);
    let job = h
        .jobs
        .enqueue(req("fake://hang", "mp4-1080"))
        .await
        .unwrap();
    let tmp = h.root.join("tmp").join(&job.id);
    let pids_file = tmp.join("pids.txt");
    let deadline = Instant::now() + Duration::from_secs(30);
    while !pids_file.exists() {
        assert!(Instant::now() < deadline, "fake never started");
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    tokio::time::sleep(Duration::from_millis(100)).await;
    let pids: Vec<u32> = std::fs::read_to_string(&pids_file)
        .unwrap()
        .split_whitespace()
        .map(|p| p.parse().unwrap())
        .collect();
    assert_eq!(pids.len(), 2);
    assert!(pids.iter().all(|p| is_alive(*p)));
    assert!(std::fs::read_dir(&tmp).unwrap().any(|e| e
        .unwrap()
        .file_name()
        .to_string_lossy()
        .ends_with(".part")));
    assert_eq!(h.job(&job.id).await.stage, JobStage::Downloading);

    h.jobs.cancel(&job.id).await.unwrap();
    let j = h.wait_terminal(&job.id).await;
    assert_eq!(j.stage, JobStage::Canceled);
    assert!(j.error.is_none() && j.filepath.is_none());
    assert!(!tmp.exists(), "tmp dir removed");
    let deadline = Instant::now() + Duration::from_secs(10);
    while pids.iter().any(|p| is_alive(*p)) {
        assert!(
            Instant::now() < deadline,
            "process tree still alive: {pids:?}"
        );
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    assert!(h.env.completed.lock().unwrap().is_empty());
    // Cancelling again is a no-op; unknown ids are errors.
    h.jobs.cancel(&job.id).await.unwrap();
    assert!(h.jobs.cancel(&"nope".to_string()).await.is_err());
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn cancel_queued_job_never_starts() {
    let h = harness(1);
    let running = h
        .jobs
        .enqueue(req("fake://hang", "mp4-1080"))
        .await
        .unwrap();
    let queued = h
        .jobs
        .enqueue(req("fake://success", "mp4-1080"))
        .await
        .unwrap();
    h.jobs.cancel(&queued.id).await.unwrap();
    assert_eq!(h.job(&queued.id).await.stage, JobStage::Canceled);
    h.jobs.cancel(&running.id).await.unwrap();
    assert_eq!(h.wait_terminal(&running.id).await.stage, JobStage::Canceled);
    tokio::time::sleep(Duration::from_millis(200)).await;
    let stages: Vec<_> = h
        .events_of(&queued.id)
        .iter()
        .map(|(_, j)| j.stage)
        .collect();
    assert_eq!(stages, [JobStage::Queued, JobStage::Canceled]);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn errors_are_classified() {
    let h = harness(4);
    let cases = [
        ("bot_check", ErrorCode::BotCheck),
        ("ffmpeg_missing", ErrorCode::FfmpegMissing),
        ("cookies_locked", ErrorCode::CookiesLocked),
        ("network", ErrorCode::Network),
    ];
    let mut ids = vec![];
    for (fixture, _) in cases {
        let url = format!("fake://error/{fixture}");
        ids.push(h.jobs.enqueue(req(&url, "mp4-1080")).await.unwrap().id);
    }
    for (id, (fixture, code)) in ids.iter().zip(cases) {
        let j = h.wait_terminal(id).await;
        assert_eq!(j.stage, JobStage::Error, "{fixture}");
        let err = j.error.expect("error set");
        assert_eq!(err.code, code, "{fixture}: {}", err.detail);
        assert!(err.detail.starts_with("ERROR:"), "{}", err.detail);
        assert!(!h.root.join("tmp").join(id).exists());
    }
    assert!(h.env.completed.lock().unwrap().is_empty());
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn missing_binary_and_unknown_preset() {
    let h = harness_with(2, None);
    let j = h
        .jobs
        .enqueue(req("fake://success", "mp4-1080"))
        .await
        .unwrap();
    let j = h.wait_terminal(&j.id).await;
    assert_eq!(j.error.unwrap().code, ErrorCode::BinaryMissing);

    let h = harness_with(2, Some(h.root.join("does-not-exist").join("yt-dlp.exe")));
    let j = h
        .jobs
        .enqueue(req("fake://success", "mp4-1080"))
        .await
        .unwrap();
    let j = h.wait_terminal(&j.id).await;
    assert_eq!(j.error.unwrap().code, ErrorCode::BinaryMissing);

    let err = h
        .jobs
        .enqueue(req("fake://success", "nope"))
        .await
        .unwrap_err();
    let ce: CommandError = err.downcast().unwrap();
    assert!(ce.detail.contains("unknown preset"));
    assert!(h.jobs.enqueue(req("   ", "mp4-1080")).await.is_err());
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn retry_remove_and_clear() {
    let h = harness(2);
    let mut r = req("fake://error/network", "mp4-1080");
    r.video_password = Some("s3cret".into());
    let failed = h.jobs.enqueue(r).await.unwrap();
    assert_eq!(h.wait_terminal(&failed.id).await.stage, JobStage::Error);

    let retried = h.jobs.retry(&failed.id).await.unwrap();
    assert_ne!(retried.id, failed.id);
    assert_eq!(retried.seq, failed.seq + 1);
    assert_eq!(retried.url, failed.url);
    assert_eq!(retried.stage, JobStage::Queued);
    assert_eq!(h.wait_terminal(&retried.id).await.stage, JobStage::Error);
    assert_eq!(h.jobs.list().await.len(), 2);

    // Secrets never reach emitted jobs.
    for (_, j) in h.env.events.lock().unwrap().iter() {
        assert!(!serde_json::to_string(j).unwrap().contains("s3cret"));
    }

    let hanging = h
        .jobs
        .enqueue(req("fake://hang", "mp4-1080"))
        .await
        .unwrap();
    assert!(h.jobs.retry(&hanging.id).await.is_err(), "active job");
    assert!(h.jobs.remove(&hanging.id).await.is_err(), "active job");

    h.jobs.remove(&failed.id).await.unwrap();
    assert!(h.jobs.remove(&failed.id).await.is_err());
    let cleared = h.jobs.clear_finished().await;
    assert_eq!(cleared, vec![retried.id.clone()]);
    let left: Vec<_> = h.jobs.list().await.into_iter().map(|j| j.id).collect();
    assert_eq!(left, vec![hanging.id.clone()]);
    h.jobs.cancel(&hanging.id).await.unwrap();
    h.wait_terminal(&hanging.id).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn throttling_keeps_terminal_event() {
    let h = harness(1);
    // 2 streams × 20 steps × 5 ms: far more progress lines than 4/s.
    let job = h
        .jobs
        .enqueue(req("fake://slow/5", "mp4-1080"))
        .await
        .unwrap();
    let done = h.wait_terminal(&job.id).await;
    assert_eq!(done.stage, JobStage::Done);
    let events = h.events_of(&job.id);
    let (_, last) = events.last().unwrap();
    assert_eq!(last.stage, JobStage::Done);
    assert_eq!(last.progress, 1.0);
    assert!(last.filepath.is_some());
    // Consecutive emissions that carry no significant change are ≥ EMIT_INTERVAL apart.
    let key = |j: &Job| {
        (
            j.stage,
            j.title.clone(),
            j.filepath.clone(),
            j.playlist_index,
        )
    };
    for w in events.windows(2) {
        let ((t0, a), (t1, b)) = (&w[0], &w[1]);
        if key(a) == key(b) {
            assert!(
                *t1 - *t0 >= EMIT_INTERVAL - Duration::from_millis(5),
                "throttle violated: {:?}",
                *t1 - *t0
            );
        }
    }
    assert!(events.len() < 20, "throttled: {} emissions", events.len());
}

/// yt-dlp rewrites the `--cookies` jar on exit; jobs must hand it a per-run copy so the
/// canonical cookies.txt (written by the extension / import) is never clobbered.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn cookies_jar_is_an_ephemeral_copy() {
    let h = harness(1);
    let canonical = h.root.join("auth").join("cookies.txt");
    std::fs::create_dir_all(canonical.parent().unwrap()).unwrap();
    let jar = "# Netscape HTTP Cookie File\n.a.com\tTRUE\t/\tFALSE\t0\tn\tv\n";
    std::fs::write(&canonical, jar).unwrap();
    *h.env.cookies.lock().unwrap() = Some(canonical.clone());

    let job = h
        .jobs
        .enqueue(req("fake://success", "mp4-1080"))
        .await
        .unwrap();
    let done = h.wait_terminal(&job.id).await;
    assert_eq!(done.stage, JobStage::Done, "{:?}", done.error);
    assert_eq!(std::fs::read_to_string(&canonical).unwrap(), jar);
    // The copy lived in the job's tmp dir, which is gone with it.
    assert!(!h.env.tmp.join(&job.id).exists());

    // A missing jar fails the job cleanly instead of running without cookies.
    std::fs::remove_file(&canonical).unwrap();
    let job = h
        .jobs
        .enqueue(req("fake://success", "mp4-1080"))
        .await
        .unwrap();
    let failed = h.wait_terminal(&job.id).await;
    assert_eq!(failed.stage, JobStage::Error);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn speed_limit_setting_reaches_the_download() {
    let h = harness(1);
    h.env.settings.lock().unwrap().limit_rate_mbps = Some(5);
    let job = h
        .jobs
        .enqueue(req("fake://success", "mp4-1080"))
        .await
        .unwrap();
    // The fake parses `--limit-rate 5M` as a flag with a value: the URL still drives it.
    let done = h.wait_terminal(&job.id).await;
    assert_eq!(done.stage, JobStage::Done, "{:?}", done.error);
}

fn in_ms(ms: i64) -> chrono::DateTime<chrono::Utc> {
    chrono::Utc::now() + chrono::Duration::milliseconds(ms)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn scheduled_start_holds_queued_jobs_until_the_timer() {
    let h = harness(2);
    let at = in_ms(1500);
    h.jobs.set_start_at(Some(at));
    assert_eq!(h.jobs.start_at(), Some(at));
    let a = h
        .jobs
        .enqueue(req("fake://success", "mp4-1080"))
        .await
        .unwrap();
    let b = h
        .jobs
        .enqueue(req("fake://success", "mp3-320"))
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(400)).await;
    for id in [&a.id, &b.id] {
        assert_eq!(
            h.job(id).await.stage,
            JobStage::Queued,
            "held by the schedule"
        );
    }
    for id in [&a.id, &b.id] {
        assert_eq!(h.wait_terminal(id).await.stage, JobStage::Done);
    }
    assert!(chrono::Utc::now() >= at);
    assert_eq!(h.jobs.start_at(), None, "the timer clears the schedule");
    let schedules = h.env.schedules.lock().unwrap().clone();
    assert_eq!(schedules.len(), 2, "{schedules:?}");
    assert!(schedules[0].as_deref().is_some_and(|s| s.ends_with('Z')));
    assert_eq!(schedules[1], None);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn clearing_or_replacing_the_schedule() {
    let h = harness(1);
    h.jobs.set_start_at(Some(in_ms(60 * 60 * 1000)));
    let job = h
        .jobs
        .enqueue(req("fake://success", "mp4-1080"))
        .await
        .unwrap();
    // Replacing with a later time keeps holding; the earlier timer is superseded.
    h.jobs.set_start_at(Some(in_ms(2 * 60 * 60 * 1000)));
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert_eq!(h.job(&job.id).await.stage, JobStage::Queued);
    // «Empezar ahora»: clearing starts queued jobs at once.
    h.jobs.set_start_at(None);
    assert_eq!(h.jobs.start_at(), None);
    assert_eq!(h.wait_terminal(&job.id).await.stage, JobStage::Done);

    // A past instant counts as no schedule.
    h.jobs.set_start_at(Some(in_ms(-1000)));
    assert_eq!(h.jobs.start_at(), None);
    let schedules = h.env.schedules.lock().unwrap().clone();
    assert_eq!(schedules.len(), 4, "{schedules:?}");
    assert!(schedules[0].is_some() && schedules[1].is_some());
    assert_eq!(schedules[2..], [None, None]);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn superseded_timer_does_not_start_the_queue() {
    let h = harness(1);
    h.jobs.set_start_at(Some(in_ms(300)));
    // Replaced before it fires by a far-away schedule: the first timer must not pump.
    h.jobs.set_start_at(Some(in_ms(60 * 60 * 1000)));
    let job = h
        .jobs
        .enqueue(req("fake://success", "mp4-1080"))
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(900)).await;
    assert_eq!(h.job(&job.id).await.stage, JobStage::Queued);
    assert!(h.jobs.start_at().is_some());
    h.jobs.set_start_at(None);
    assert_eq!(h.wait_terminal(&job.id).await.stage, JobStage::Done);
}

// ───────────── Resume after restart ─────────────

/// Waits until the `hang` scenario started (it writes `<tmp>/pids.txt`) and returns its pids.
async fn hang_pids(tmp: &Path) -> Vec<u32> {
    let pids_file = tmp.join("pids.txt");
    let deadline = Instant::now() + Duration::from_secs(30);
    while !pids_file.exists() {
        assert!(Instant::now() < deadline, "fake never started");
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    tokio::time::sleep(Duration::from_millis(100)).await;
    std::fs::read_to_string(&pids_file)
        .unwrap()
        .split_whitespace()
        .map(|p| p.parse().unwrap())
        .collect()
}

/// The row goes right after the terminal state is published: poll until no row is left.
async fn wait_no_pending(history: &History) {
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        let rows = history.pending_list().unwrap();
        if rows.is_empty() {
            return;
        }
        assert!(Instant::now() < deadline, "rows left: {rows:#?}");
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

fn has_part(dir: &Path) -> bool {
    std::fs::read_dir(dir)
        .is_ok_and(|mut it| it.any(|e| e.unwrap().file_name().to_string_lossy().ends_with(".part")))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn pending_row_lives_from_enqueue_to_the_end() {
    let h = harness(1);
    let ok = h
        .jobs
        .enqueue(req("fake://slow/20", "mp4-1080"))
        .await
        .unwrap();
    let queued = h
        .jobs
        .enqueue(req("fake://success", "mp4-1080"))
        .await
        .unwrap();
    let mut pl = req("fake://playlist", "mp3-320");
    pl.playlist_items = Some(vec![2, 5]);
    let failing = h.jobs.enqueue(req("fake://error-bot", "mp4-1080")).await;
    let failing = failing.unwrap();
    let rows = h.env.history.pending_list().unwrap();
    assert_eq!(
        rows.iter().map(|p| p.id.clone()).collect::<Vec<_>>(),
        vec![ok.id.clone(), queued.id.clone(), failing.id.clone()]
    );
    assert_eq!(rows[0].seq, ok.seq);
    assert_eq!(rows[0].output_dir, ok.output_dir);
    assert!(rows.iter().all(|p| !p.needs_secret));

    // Canceling a queued job forgets it at once.
    h.jobs.cancel(&queued.id).await.unwrap();
    assert!(h
        .env
        .history
        .pending_list()
        .unwrap()
        .iter()
        .all(|p| p.id != queued.id));

    // Done and Error forget it too.
    assert_eq!(h.wait_terminal(&ok.id).await.stage, JobStage::Done);
    assert_eq!(h.wait_terminal(&failing.id).await.stage, JobStage::Error);
    wait_no_pending(&h.env.history).await;

    // Playlist selection is kept as is.
    let p = h.jobs.enqueue(pl).await.unwrap();
    let row = h.env.history.pending_list().unwrap().remove(0);
    assert_eq!(row.id, p.id);
    assert_eq!(row.playlist_items, Some(vec![2, 5]));
    h.wait_terminal(&p.id).await;
    wait_no_pending(&h.env.history).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn secrets_are_never_persisted_only_flagged() {
    let h = harness(1);
    let mut r = req("fake://hang", "mp4-1080");
    r.video_password = Some("placeholder-video-pw".into());
    let a = h.jobs.enqueue(r).await.unwrap();
    let mut r = req("fake://success", "mp4-1080");
    r.twofactor = Some("placeholder-2fa".into());
    let b = h.jobs.enqueue(r).await.unwrap();
    let mut r = req("fake://success", "mp4-1080");
    r.video_password = Some(String::new());
    let c = h.jobs.enqueue(r).await.unwrap();

    let rows = h.env.history.pending_list().unwrap();
    let flag = |id: &str| rows.iter().find(|p| p.id == id).unwrap().needs_secret;
    assert!(flag(&a.id) && flag(&b.id));
    assert!(!flag(&c.id), "an empty password is no secret");
    for p in &rows {
        let json = serde_json::to_string(p).unwrap();
        assert!(!json.contains("placeholder-video-pw") && !json.contains("placeholder-2fa"));
    }
    // Nothing in the database files either (WAL included).
    for f in ["history.sqlite3", "history.sqlite3-wal"] {
        if let Ok(bytes) = std::fs::read(h.root.join(f)) {
            let text = String::from_utf8_lossy(&bytes);
            assert!(!text.contains("placeholder-video-pw"), "{f}");
            assert!(!text.contains("placeholder-2fa"), "{f}");
        }
    }

    // Resume never re-queues a job that needs its secret.
    h.jobs.shutdown().await;
    let fresh = JobManager::new(h.env.clone());
    let resumed = fresh.resume(h.env.history.pending_list().unwrap()).await;
    assert!(resumed.iter().all(|j| j.id != a.id && j.id != b.id));
    fresh.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn quitting_keeps_partial_files_but_cancel_deletes_them() {
    let h = harness(2);
    let quit = h
        .jobs
        .enqueue(req("fake://hang", "mp4-1080"))
        .await
        .unwrap();
    let canceled = h
        .jobs
        .enqueue(req("fake://hang", "mp4-1080"))
        .await
        .unwrap();
    let quit_tmp = h.root.join("tmp").join(&quit.id);
    let canceled_tmp = h.root.join("tmp").join(&canceled.id);
    let pids = hang_pids(&quit_tmp).await;
    hang_pids(&canceled_tmp).await;

    h.jobs.cancel(&canceled.id).await.unwrap();
    assert_eq!(
        h.wait_terminal(&canceled.id).await.stage,
        JobStage::Canceled
    );
    assert!(!canceled_tmp.exists(), "user cancel removes tmp");

    // A third job waits in the queue behind the running one.
    h.jobs.set_concurrency(1).await;
    let waiting = h
        .jobs
        .enqueue(req("fake://success", "mp4-1080"))
        .await
        .unwrap();

    h.jobs.shutdown().await;
    let deadline = Instant::now() + Duration::from_secs(10);
    while pids.iter().any(|p| is_alive(*p)) {
        assert!(Instant::now() < deadline, "process tree alive: {pids:?}");
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    assert!(quit_tmp.exists(), "quitting keeps tmp/<id>");
    assert!(has_part(&quit_tmp));
    let ids: Vec<_> = h
        .env
        .history
        .pending_list()
        .unwrap()
        .into_iter()
        .map(|p| p.id)
        .collect();
    assert_eq!(ids, vec![quit.id.clone(), waiting.id.clone()]);
    // Nothing new starts while quitting.
    tokio::time::sleep(Duration::from_millis(200)).await;
    assert_eq!(h.job(&waiting.id).await.stage, JobStage::Queued);
    // Idempotent.
    h.jobs.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn resume_reuses_the_id_tmp_dir_and_number() {
    let h = harness(1);
    let first = h
        .jobs
        .enqueue(req("fake://hang", "mp4-1080"))
        .await
        .unwrap();
    let tmp = h.root.join("tmp").join(&first.id);
    hang_pids(&tmp).await;
    h.jobs.shutdown().await;
    assert!(has_part(&tmp));

    // Next session: a new manager on the same data. The row comes back with its id; here
    // yt-dlp finishes this time.
    let fresh = JobManager::new(h.env.clone());
    let mut rows = h.env.history.pending_list().unwrap();
    assert_eq!(rows.len(), 1);
    rows[0].url = "fake://success".into();
    let resumed = fresh.resume(rows.clone()).await;
    assert_eq!(resumed.len(), 1);
    assert_eq!(resumed[0].id, first.id);
    assert_eq!(resumed[0].seq, first.seq);
    assert_eq!(resumed[0].created_at, first.created_at);
    assert_eq!(resumed[0].stage, JobStage::Queued);
    // Resuming twice does not duplicate it.
    assert!(fresh.resume(rows).await.is_empty());

    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        let j = fresh
            .list()
            .await
            .into_iter()
            .find(|j| j.id == first.id)
            .unwrap();
        if j.stage.is_terminal() {
            assert_eq!(j.stage, JobStage::Done, "{j:#?}");
            break;
        }
        assert!(Instant::now() < deadline);
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert!(!tmp.exists(), "done removes tmp/<id>");
    wait_no_pending(&h.env.history).await;
    // Numbers continue after the resumed one.
    let next = fresh
        .enqueue(req("fake://success", "mp4-1080"))
        .await
        .unwrap();
    assert_eq!(next.seq, first.seq + 1);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn resumed_number_moves_the_counter_forward_only() {
    let h = harness(1);
    let row = |id: &str, seq: u64| PendingJob {
        id: id.into(),
        seq,
        url: "fake://success".into(),
        preset_id: "mp4-1080".into(),
        playlist_items: None,
        output_dir: h.root.join("Videos").to_string_lossy().into_owned(),
        title: Some("T".into()),
        thumbnail: None,
        kind: ymd_lib::model::MediaKind::Video,
        created_at: "2026-01-01T00:00:00Z".into(),
        needs_secret: false,
    };
    let a = "6f1c9a52-1f0e-4a8e-9c35-0b7a0f0c1a01";
    let b = "6f1c9a52-1f0e-4a8e-9c35-0b7a0f0c1a02";
    let got = h.jobs.resume(vec![row(a, 90)]).await;
    assert_eq!(got[0].seq, 90);
    assert_eq!(h.jobs.next_seq().await, 91);
    // An older number does not move the counter back.
    h.jobs.resume(vec![row(b, 7)]).await;
    assert_eq!(h.jobs.next_seq().await, 91);
    for id in [a, b] {
        h.wait_terminal(id).await;
    }
}

#[test]
fn orphan_tmp_dirs_are_swept_and_discard_only_takes_job_ids() {
    let dir = tempfile::tempdir().unwrap();
    let tmp = dir.path().join("tmp");
    let kept = "0b7c2f8e-3a1d-4c5b-9e6f-112233445566";
    let orphan = "0b7c2f8e-3a1d-4c5b-9e6f-665544332211";
    for d in [kept, orphan, "not-a-job"] {
        std::fs::create_dir_all(tmp.join(d)).unwrap();
        std::fs::write(tmp.join(d).join("x.part"), "p").unwrap();
    }
    std::fs::write(tmp.join("ymd-cookies-1.txt"), "c").unwrap();
    let keep: std::collections::HashSet<JobId> = [kept.to_string()].into();
    assert_eq!(jobs::sweep_orphan_tmp(&tmp, &keep), 1);
    assert!(tmp.join(kept).join("x.part").exists());
    assert!(!tmp.join(orphan).exists());
    assert!(tmp.join("not-a-job").exists(), "only job dirs are touched");
    assert!(tmp.join("ymd-cookies-1.txt").exists());
    assert_eq!(
        jobs::sweep_orphan_tmp(&dir.path().join("missing"), &keep),
        0
    );

    assert!(!jobs::discard_tmp(&tmp, "../tmp"));
    assert!(!jobs::discard_tmp(&tmp, "not-a-job"));
    assert!(!jobs::discard_tmp(&tmp, &kept.to_uppercase()));
    assert!(jobs::discard_tmp(&tmp, kept));
    assert!(!tmp.join(kept).exists());
}
