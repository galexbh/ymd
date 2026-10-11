pub mod auth;
pub mod commands;
pub mod deps;
pub mod diagnostics;
pub mod history;
pub mod jobs;
pub mod model;
pub mod open_url;
pub mod paths;
pub mod process;
pub mod settings;
pub mod state;
pub mod timers;
pub mod tray;
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
    // No logging here: stdout is yt-dlp's answer channel and the helper must stay minimal.
    // The helper has no Tauri context: resolve the same data dir Tauri would use.
    let index = helper_index_file();
    let store = OsKeychain { index_file: index };
    Some(auth::netrc::helper_main(&args[1..], &store))
}

/// Runs the cookie-bridge native-messaging host when a Chromium browser launched ymd as
/// `ymd chrome-extension://<id>/ ...`; returns its exit code, or `None` for a normal launch.
pub fn maybe_run_native_host() -> Option<i32> {
    let args: Vec<String> = std::env::args().collect();
    if !args
        .get(1)
        .is_some_and(|a| a.starts_with("chrome-extension://"))
    {
        return None;
    }
    // `YMD_DATA_DIR` exists for the integration tests (tests/native_host.rs).
    let data_dir = std::env::var_os("YMD_DATA_DIR")
        .filter(|v| !v.is_empty())
        .map(std::path::PathBuf::from)
        .unwrap_or_else(helper_data_dir);
    // File-only logs (stdout is the native-messaging channel), and only for an allowed
    // caller: a rejected origin writes nothing at all.
    if args
        .get(1)
        .is_some_and(|o| auth::native_host::is_allowed_origin(o))
    {
        diagnostics::logging::init_file_only(&paths::logs_dir(&data_dir));
    }
    Some(auth::native_host::host_main(
        &args[1..],
        &data_dir,
        std::io::stdin().lock(),
        std::io::stdout().lock(),
    ))
}

fn helper_index_file() -> std::path::PathBuf {
    helper_data_dir().join("auth").join("accounts.json")
}

/// The app data dir Tauri would resolve (`%APPDATA%\com.ymd.app` and equivalents), for the
/// helper modes that run without a Tauri context.
fn helper_data_dir() -> std::path::PathBuf {
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
    base.unwrap_or_default().join(IDENTIFIER)
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

    // Local logs first, so everything below is recorded. Old files go before the new one opens.
    let logs_dir = paths::logs_dir(&data_dir);
    diagnostics::retention::prune_logs(
        &logs_dir,
        std::time::SystemTime::now(),
        diagnostics::retention::max_age(),
        diagnostics::retention::LOG_MAX_BYTES,
    );
    if let Some(guard) = diagnostics::logging::init_app(&logs_dir) {
        // Flushed on `RunEvent::Exit` (Tauri never drops managed state).
        app.manage(guard);
    }
    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        os = std::env::consts::OS,
        arch = std::env::consts::ARCH,
        "ymd started"
    );

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
    // Plain cookie copies outlive their job only after a crash; none may stay on disk.
    let swept = auth::cookies::sweep_stale_copies(&paths.tmp_dir());
    if swept > 0 {
        log::info!("removed {swept} left-over cookie copies");
    }
    // Temp files of an interrupted cookie sync (a native host killed mid-write).
    let swept = auth::cookies::sweep_auth_temps(&paths);
    if swept > 0 {
        log::info!("removed {swept} left-over cookie temp files");
    }

    let history = Arc::new(History::open(&paths.history_db())?);
    // Downloads nobody resumed for weeks: forget the row and delete the partial files.
    let cutoff = chrono::Utc::now() - chrono::Duration::days(history::PENDING_MAX_AGE_DAYS);
    match history.pending_expire(cutoff) {
        Ok(expired) => {
            for id in &expired {
                jobs::discard_tmp(&paths.tmp_dir(), id);
            }
            if !expired.is_empty() {
                log::info!(
                    "forgot {} unfinished downloads older than 14 days",
                    expired.len()
                );
            }
        }
        Err(e) => log::warn!("pending jobs: cannot expire old ones: {e:#}"),
    }
    // Job dirs survive only for downloads that can still be resumed (nothing auto-starts:
    // the Cola screen offers them). Any other `tmp/<uuid>` is left over from a crash.
    let keep: std::collections::HashSet<_> = match history.pending_list() {
        Ok(rows) => rows.into_iter().map(|p| p.id).collect(),
        Err(e) => {
            log::warn!("pending jobs: cannot read them: {e:#}");
            Default::default()
        }
    };
    let orphans = jobs::sweep_orphan_tmp(&paths.tmp_dir(), &keep);
    if orphans > 0 {
        log::info!("removed {orphans} left-over job folders");
    }
    let keychain = Arc::new(OsKeychain {
        index_file: paths.auth_dir().join("accounts.json"),
    });
    let deps = Arc::new(DepsManager::new(paths.clone(), settings.ytdlp_channel));

    let env = Arc::new(TauriJobEnv {
        app: handle.clone(),
        inner: std::sync::OnceLock::new(),
    });
    let jobs = JobManager::new(env.clone());

    let language = settings.language;
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
    tray::create(&handle, language);

    // «Descargar con ymd» on a cold start: the browser link came in this process's argv.
    let pending = open_url::PendingUrl::default();
    if let Some(url) = open_url::parse_open_url_arg(&std::env::args().collect::<Vec<_>>()) {
        pending.set(url);
    }
    app.manage(pending);

    // Cookie bridge: (re)register the native-messaging host so it points at this executable.
    let bridge_dir = state.paths().data_dir;
    std::thread::spawn(move || match std::env::current_exe() {
        Ok(exe) => {
            let targets = auth::native_registry::register(&bridge_dir, &exe);
            let n = targets.iter().filter(|t| t.registered).count();
            log::info!("cookie bridge: host registered for {n} browser(s)");
        }
        Err(e) => log::warn!("cookie bridge: cannot resolve the executable: {e}"),
    });

    // Log retention: daily, by the wall clock (startup already pruned).
    timers::spawn_periodic(timers::DAY, timers::DAILY_TICK, false, move || {
        let logs_dir = logs_dir.clone();
        async move {
            let removed = diagnostics::retention::prune_logs(
                &logs_dir,
                std::time::SystemTime::now(),
                diagnostics::retention::max_age(),
                diagnostics::retention::LOG_MAX_BYTES,
            );
            tracing::info!(removed, "old log files pruned");
        }
    });

    // yt-dlp auto-update: on startup, then once a day by the wall clock.
    let update_state = state.clone();
    timers::spawn_periodic(timers::DAY, timers::DAILY_TICK, true, move || {
        commands::deps::auto_update(handle.clone(), update_state.clone())
    });

    // Temporary files (job dirs a Windows handle kept, crash leftovers, cookie copies): a tray
    // session can last for weeks, so they are swept every 30 minutes too.
    timers::spawn_periodic(timers::SWEEP_PERIOD, timers::SWEEP_TICK, false, move || {
        let state = state.clone();
        async move {
            let result = tokio::task::spawn_blocking(move || sweep_temporaries(&state)).await;
            if let Ok((dirs, copies)) = result {
                if dirs + copies > 0 {
                    log::info!(
                        "periodic sweep: removed {dirs} job folders, {copies} cookie copies"
                    );
                }
            }
        }
    });
    Ok(())
}

/// One periodic clean-up of `tmp/`: job dirs of no active or resumable job, and cookie copies
/// no probe, cookie test or running job can still be using.
fn sweep_temporaries(state: &AppState) -> (usize, usize) {
    let tmp = state.paths().tmp_dir();
    let history = state.history.clone();
    let dirs = state.jobs.sweep_tmp(move || match history.pending_list() {
        Ok(rows) => rows.into_iter().map(|p| p.id).collect(),
        // Unknown rows: keep every job dir this time.
        Err(_) => std::fs::read_dir(&tmp)
            .map(|it| {
                it.flatten()
                    .map(|e| e.file_name().to_string_lossy().into_owned())
                    .collect()
            })
            .unwrap_or_default(),
    });
    let copies = auth::cookies::sweep_stale_copies_while_running(
        &state.paths().tmp_dir(),
        auth::cookies::STALE_COPY_AGE,
        &state.jobs.active_ids(),
    );
    (dirs, copies)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // First: a second `ymd` (e.g. `ymd --open-url` from the cookie-bridge host) hands its
        // argv to this one and exits.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            use tauri::Emitter;
            if let Some(url) = open_url::parse_open_url_arg(&argv) {
                app.state::<open_url::PendingUrl>().set(url);
                let _ = app.emit(model::EVT_OPEN_URL, ());
            }
            open_url::focus_main(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(setup)
        .on_window_event(tray::on_window_event)
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
            commands::jobs::jobs_next_seq,
            commands::jobs::queue_schedule,
            commands::jobs::queue_schedule_get,
            commands::jobs::jobs_pending,
            commands::jobs::jobs_resume,
            commands::jobs::jobs_discard_pending,
            commands::history::history_query,
            commands::history::history_delete,
            commands::history::history_clear,
            commands::settings::settings_get,
            commands::settings::settings_set,
            commands::settings::take_pending_url,
            commands::auth::browsers_detect,
            commands::auth::cookies_info,
            commands::auth::cookies_clear,
            commands::auth::cookies_test,
            commands::auth::credentials_list,
            commands::auth::credentials_set,
            commands::auth::credentials_delete,
            commands::auth::extension_status,
            commands::auth::extension_open_page,
            commands::diagnostics::app_data_dir,
            commands::diagnostics::diagnostics_export,
        ])
        .build(tauri::generate_context!())
        .expect("error while building ymd")
        .run(|app, event| {
            match &event {
                // «Salir» in the tray (`app.exit(0)`) or the last window closing: kill the
                // downloads now, but keep their `.part` files and rows so they can be resumed.
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                    if let Some(state) = app.try_state::<Arc<AppState>>() {
                        let jobs = state.jobs.clone();
                        tauri::async_runtime::block_on(async move { jobs.shutdown().await });
                    }
                    if matches!(event, tauri::RunEvent::Exit) {
                        tracing::info!("ymd exiting");
                        if let Some(guard) = app.try_state::<diagnostics::logging::LogGuard>() {
                            guard.flush();
                        }
                    }
                }
                // macOS: clicking the Dock icon brings back a window hidden to the menu bar.
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen { .. } => open_url::focus_main(app),
                _ => {}
            }
        });
}
