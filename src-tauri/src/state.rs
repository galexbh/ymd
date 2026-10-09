//! Application state and the real `JobEnv`. Owner: integration (main thread).

use crate::auth::keychain::SecretStore;
use crate::deps::manager::DepsManager;
use crate::deps::Tools;
use crate::history::History;
use crate::jobs::{JobEnv, JobManager};
use crate::model::{EnqueueRequest, Job, Preset, Settings, EVT_JOB_UPDATE};
use crate::paths::AppPaths;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, Emitter};

pub struct AppState {
    pub app: AppHandle,
    pub paths: RwLock<AppPaths>,
    pub settings: RwLock<Settings>,
    pub deps: tokio::sync::RwLock<Arc<DepsManager>>,
    pub history: Arc<History>,
    pub keychain: Arc<dyn SecretStore>,
    pub jobs: Arc<JobManager>,
}

impl AppState {
    pub fn paths(&self) -> AppPaths {
        self.paths.read().expect("paths lock").clone()
    }
    pub fn settings(&self) -> Settings {
        self.settings.read().expect("settings lock").clone()
    }
    pub async fn tools(&self) -> Tools {
        self.deps.read().await.tools().await
    }
    /// The running executable, used as the `--netrc-cmd` helper.
    pub fn helper_exe() -> PathBuf {
        std::env::current_exe().unwrap_or_else(|_| PathBuf::from("ymd"))
    }
    pub fn has_credentials(&self) -> bool {
        self.keychain.list().map(|l| !l.is_empty()).unwrap_or(false)
    }
    pub fn auth_args(&self, req: Option<&EnqueueRequest>) -> Vec<String> {
        crate::auth::args_for(
            &self.settings().cookies,
            &self.paths(),
            self.has_credentials(),
            &Self::helper_exe(),
            req,
        )
    }
}

/// `JobEnv` backed by the live app. Holds a weak-ish handle to state through the AppHandle.
pub struct TauriJobEnv {
    pub app: AppHandle,
    pub inner: std::sync::OnceLock<Arc<AppState>>,
}

impl TauriJobEnv {
    fn state(&self) -> &Arc<AppState> {
        self.inner.get().expect("AppState initialized before jobs run")
    }
}

impl JobEnv for TauriJobEnv {
    fn settings(&self) -> Settings {
        self.state().settings()
    }
    fn tools(&self) -> std::pin::Pin<Box<dyn std::future::Future<Output = Tools> + Send + '_>> {
        Box::pin(async move { self.state().tools().await })
    }
    fn auth_args(&self, req: &EnqueueRequest) -> Vec<String> {
        self.state().auth_args(Some(req))
    }
    fn tmp_dir(&self) -> PathBuf {
        self.state().paths().tmp_dir()
    }
    fn archive_file(&self) -> PathBuf {
        self.state().paths().archive_file()
    }
    fn emit(&self, job: &Job) {
        let _ = self.app.emit(EVT_JOB_UPDATE, job);
    }
    fn completed(&self, job: &Job, preset: &Preset) {
        if let Err(e) = self.state().history.record(job, preset) {
            log::warn!("history record failed: {e:#}");
        }
        use tauri_plugin_notification::NotificationExt;
        let title = job.title.clone().unwrap_or_else(|| job.url.clone());
        let _ = self
            .app
            .notification()
            .builder()
            .title("ymd")
            .body(title)
            .show();
    }
}
