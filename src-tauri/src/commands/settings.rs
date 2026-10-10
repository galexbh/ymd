use super::State;
use crate::deps::manager::DepsManager;
use crate::model::{CmdResult, Settings};
use crate::paths::AppPaths;
use std::sync::Arc;

#[tauri::command]
pub async fn settings_get(state: State<'_>) -> CmdResult<Settings> {
    Ok(state.settings())
}

/// Saves sanitized settings and applies side effects (concurrency, bin dir, channel).
/// Returns what was actually stored.
#[tauri::command]
pub async fn settings_set(state: State<'_>, settings: Settings) -> CmdResult<Settings> {
    let new = crate::settings::sanitize(settings);
    let old = state.settings();
    let paths = state.paths();
    crate::settings::save(&paths.settings_file(), &new)?;
    *state.settings.write().expect("settings lock") = new.clone();

    if new.concurrency != old.concurrency {
        state.jobs.set_concurrency(new.concurrency).await;
    }
    if new.bin_dir != old.bin_dir || new.ytdlp_channel != old.ytdlp_channel {
        let paths = AppPaths::new(
            paths.data_dir.clone(),
            paths.config_dir.clone(),
            new.bin_dir.as_deref(),
        );
        *state.paths.write().expect("paths lock") = paths.clone();
        *state.deps.write().await = Arc::new(DepsManager::new(paths, new.ytdlp_channel));
    }
    Ok(new)
}
