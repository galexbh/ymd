//! What a real download writes to the local logs: one `job` span per download with
//! `stage finished` / `job finished` events, and never the URL, argv or secrets.
#![cfg(feature = "test-support")]

use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tracing_subscriber::fmt::MakeWriter;
use tracing_subscriber::layer::SubscriberExt;
use ymd_lib::deps::Tools;
use ymd_lib::diagnostics::logging::json_layer;
use ymd_lib::jobs::{JobEnv, JobManager};
use ymd_lib::model::{EnqueueRequest, Job, Preset, Settings};

const FAKE: &str = env!("CARGO_BIN_EXE_fake-ytdlp");
const PASSWORD: &str = "hunter2-video-pass";

#[derive(Clone, Default)]
struct Sink(Arc<Mutex<Vec<u8>>>);
impl Write for Sink {
    fn write(&mut self, b: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(b);
        Ok(b.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
impl<'a> MakeWriter<'a> for Sink {
    type Writer = Sink;
    fn make_writer(&'a self) -> Sink {
        self.clone()
    }
}

struct Env {
    settings: Settings,
    tmp: PathBuf,
}

impl JobEnv for Env {
    fn settings(&self) -> Settings {
        self.settings.clone()
    }
    fn tools(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = Tools> + Send + '_>> {
        Box::pin(async move {
            Tools {
                ytdlp: Some(FAKE.into()),
                ..Tools::default()
            }
        })
    }
    fn auth_args(&self, req: &EnqueueRequest) -> Vec<String> {
        match &req.video_password {
            Some(p) => vec!["--video-password".into(), p.clone()],
            None => vec![],
        }
    }
    fn tmp_dir(&self) -> PathBuf {
        self.tmp.clone()
    }
    fn archive_file(&self) -> PathBuf {
        self.tmp.join("archive.txt")
    }
    fn emit(&self, _job: &Job) {}
    fn completed(&self, _job: &Job, _preset: &Preset) {}
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn downloads_log_stages_and_outcomes_without_secrets() {
    let sink = Sink::default();
    tracing::subscriber::set_global_default(
        tracing_subscriber::registry().with(json_layer(sink.clone())),
    )
    .unwrap();

    let dir = tempfile::tempdir().unwrap();
    let mut settings =
        ymd_lib::settings::defaults(&dir.path().join("Videos"), &dir.path().join("Music"));
    settings.concurrency = 2;
    let preset = settings.default_preset_id.clone();
    let jobs = JobManager::new(Arc::new(Env {
        settings,
        tmp: dir.path().join("tmp"),
    }));
    let req = |url: &str| EnqueueRequest {
        url: url.into(),
        preset_id: preset.clone(),
        playlist_items: None,
        output_dir: None,
        video_password: Some(PASSWORD.into()),
        twofactor: None,
        title: None,
        thumbnail: None,
    };
    let ok = jobs.enqueue(req("fake://success")).await.unwrap();
    let bad = jobs.enqueue(req("fake://error-bot")).await.unwrap();
    let deadline = Instant::now() + Duration::from_secs(30);
    while jobs.list().await.iter().any(|j| !j.stage.is_terminal()) {
        assert!(Instant::now() < deadline, "jobs did not finish");
        tokio::time::sleep(Duration::from_millis(20)).await;
    }

    let out = String::from_utf8(sink.0.lock().unwrap().clone()).unwrap();
    assert!(!out.contains(PASSWORD), "{out}");
    assert!(!out.contains("fake://"), "URLs are never logged:\n{out}");
    assert!(
        !out.contains("--video-password"),
        "argv is never logged:\n{out}"
    );

    let events: Vec<serde_json::Value> = out
        .lines()
        .map(|l| serde_json::from_str(l).expect("JSON line"))
        .collect();
    let of = |id: &str, msg: &str| -> Vec<serde_json::Value> {
        events
            .iter()
            .filter(|e| e["span"]["id"] == id && e["fields"]["message"] == msg)
            .cloned()
            .collect()
    };

    let stages: Vec<String> = of(&ok.id, "stage finished")
        .iter()
        .map(|e| e["fields"]["stage"].as_str().unwrap().to_string())
        .collect();
    assert!(
        stages.starts_with(&["downloading".to_string()]),
        "{stages:?}"
    );
    assert!(stages.contains(&"merging".to_string()), "{stages:?}");
    for e in of(&ok.id, "stage finished") {
        assert!(e["fields"]["duration_ms"].is_u64(), "{e}");
    }
    let done = of(&ok.id, "job finished");
    assert_eq!(done.len(), 1);
    assert_eq!(done[0]["fields"]["outcome"], "done");
    assert_eq!(done[0]["span"]["kind"], "video");
    assert_eq!(done[0]["span"]["preset"], preset.as_str());

    let failed = of(&bad.id, "job finished");
    assert_eq!(failed.len(), 1);
    assert_eq!(failed[0]["level"], "WARN");
    assert_eq!(failed[0]["fields"]["outcome"], "error");
    assert_eq!(failed[0]["fields"]["error_code"], "bot_check");
    let last_stage = of(&bad.id, "stage finished");
    assert_eq!(
        last_stage.last().unwrap()["fields"]["outcome"],
        "error",
        "{last_stage:?}"
    );
}
