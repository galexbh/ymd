pub mod auth;
pub mod commands;
pub mod deps;
pub mod history;
pub mod jobs;
pub mod model;
pub mod paths;
pub mod process;
pub mod settings;
pub mod state;
pub mod ytdlp;

use crate::auth::keychain::OsKeychain;
use crate::deps::manager::DepsManager;
use crate::history::History;
use crate::jobs::JobManager;
use crate::paths::AppPaths;
use crate::state::{AppState, TauriJobEnv};
use std::sync::{Arc, RwLock};
use tauri::Manager;

/// Runs `ymd --netrc-helper <extractor>` and returns its exit code, or `None` for a normal launch.
pub fn maybe_run_netrc_helper() -> Option<i32> {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) != Some(auth::netrc::HELPER_FLAG) {
        return None;
    }
    // The helper has no Tauri context: resolve the same data dir Tauri would use.
    let index = helper_index_file();
    let store = OsKeychain { index_file: index };
    Some(auth::netrc::helper_main(&args[1..], &store))
}

fn helper_index_file() -> std::path::PathBuf {
    let base = if cfg!(windows) {
        std::env::var_os("APPDATA").map(std::path::PathBuf::from)
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME")
            .map(|h| std::path::PathBuf::from(h).join("Library/Application Support"))
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(std::path::PathBuf::from)
            .or_else(|| {
                std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".local/share"))
            })
    };
    base.unwrap_or_default()
        .join(IDENTIFIER)
        .join("auth")
        .join("accounts.json")
}

pub const IDENTIFIER: &str = "com.ymd.app";

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let path = app.path();
    let data_dir = path.app_data_dir()?;
    let config_dir = path.app_config_dir()?;
    let video_dir = path.video_dir().unwrap_or_else(|_| data_dir.join("Videos"));
    let audio_dir = path.audio_dir().unwrap_or_else(|_| data_dir.join("Music"));

    let defaults = settings::defaults(&video_dir, &audio_dir);
    let settings_file = config_dir.join("settings.json");
    let settings = settings::load(&settings_file, defaults);

    let paths = AppPaths::new(data_dir, config_dir, settings.bin_dir.as_deref());
    for dir in [
        &paths.bin_dir,
        &paths.data_dir,
        &paths.config_dir,
        &paths.tmp_dir(),
        &paths.auth_dir(),
    ] {
        std::fs::create_dir_all(dir)?;
    }

    let history = Arc::new(History::open(&paths.history_db())?);
    let keychain = Arc::new(OsKeychain {
        index_file: paths.auth_dir().join("accounts.json"),
    });
    let deps = Arc::new(DepsManager::new(paths.clone(), settings.ytdlp_channel));

    let env = Arc::new(TauriJobEnv {
        app: handle.clone(),
        inner: std::sync::OnceLock::new(),
    });
    let jobs = JobManager::new(env.clone());

    let state = Arc::new(AppState {
        app: handle.clone(),
        paths: RwLock::new(paths),
        settings: RwLock::new(settings),
        deps: tokio::sync::RwLock::new(deps),
        history,
        keychain,
        jobs,
    });
    let _ = env.inner.set(state.clone());
    app.manage(state.clone());

    // yt-dlp auto-update: on startup, then every 24h.
    tauri::async_runtime::spawn(async move {
        loop {
            commands::deps::auto_update(handle.clone(), state.clone()).await;
            tokio::time::sleep(std::time::Duration::from_secs(24 * 60 * 60)).await;
        }
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .setup(setup)
        .invoke_handler(tauri::generate_handler![
            commands::deps::deps_report,
            commands::deps::deps_install,
            commands::deps::deps_remove,
            commands::deps::deps_install_recommended,
            commands::jobs::probe,
            commands::jobs::enqueue,
            commands::jobs::jobs_list,
            commands::jobs::job_cancel,
            commands::jobs::job_retry,
            commands::jobs::job_remove,
            commands::jobs::jobs_clear_finished,
            commands::history::history_query,
            commands::history::history_delete,
            commands::history::history_clear,
            commands::settings::settings_get,
            commands::settings::settings_set,
            commands::auth::browsers_detect,
            commands::auth::cookies_snapshot,
            commands::auth::cookies_import,
            commands::auth::cookies_info,
            commands::auth::cookies_clear,
            commands::auth::cookies_test,
            commands::auth::credentials_list,
            commands::auth::credentials_set,
            commands::auth::credentials_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ymd");
}
