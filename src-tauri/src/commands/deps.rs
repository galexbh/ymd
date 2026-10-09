use super::State;
use crate::deps::manager::ProgressFn;
use crate::model::{
    CmdResult, CommandError, DepId, DepLevel, DepState, DepsReport, ErrorCode, EVT_DEPS_CHANGED,
    EVT_DEPS_PROGRESS,
};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

fn progress_fn(app: &AppHandle) -> ProgressFn {
    let app = app.clone();
    Arc::new(move |p| {
        let _ = app.emit(EVT_DEPS_PROGRESS, &p);
    })
}

#[tauri::command]
pub async fn deps_report(state: State<'_>, check_latest: bool) -> CmdResult<DepsReport> {
    let deps = state.deps.read().await.clone();
    Ok(deps.report(check_latest).await?)
}

#[tauri::command]
pub async fn deps_install(app: AppHandle, state: State<'_>, id: DepId) -> CmdResult<DepsReport> {
    if id == DepId::Ytdlp && state.jobs.active_count().await > 0 {
        return Err(CommandError::new(
            ErrorCode::Unknown,
            "yt-dlp cannot be replaced while downloads are running",
        ));
    }
    let deps = state.deps.read().await.clone();
    deps.install(id, progress_fn(&app)).await?;
    let report = deps.report(false).await?;
    let _ = app.emit(EVT_DEPS_CHANGED, &report);
    Ok(report)
}

#[tauri::command]
pub async fn deps_remove(app: AppHandle, state: State<'_>, id: DepId) -> CmdResult<DepsReport> {
    let deps = state.deps.read().await.clone();
    deps.remove(id).await?;
    let report = deps.report(false).await?;
    let _ = app.emit(EVT_DEPS_CHANGED, &report);
    Ok(report)
}

/// Installs every required + recommended dependency that is missing (Deno only when no
/// other JS runtime was detected).
#[tauri::command]
pub async fn deps_install_recommended(app: AppHandle, state: State<'_>) -> CmdResult<DepsReport> {
    let deps = state.deps.read().await.clone();
    let report = deps.report(false).await?;
    for d in &report.deps {
        let wanted = match d.level {
            DepLevel::Required => true,
            DepLevel::Recommended => d.id != DepId::Deno || report.js_runtime.is_none(),
            DepLevel::Optional => false,
        };
        if wanted && d.state == DepState::Missing && d.can_install {
            deps.install(d.id, progress_fn(&app)).await?;
        }
    }
    let report = deps.report(false).await?;
    let _ = app.emit(EVT_DEPS_CHANGED, &report);
    Ok(report)
}

/// Background auto-update of yt-dlp (called on startup and every 24h). Skips while jobs run.
pub async fn auto_update(app: AppHandle, state: Arc<crate::state::AppState>) {
    if !state.settings().auto_update || state.jobs.active_count().await > 0 {
        return;
    }
    let deps = state.deps.read().await.clone();
    let Ok(report) = deps.report(true).await else {
        return;
    };
    for d in report.deps.iter().filter(|d| d.id == DepId::Ytdlp) {
        if (d.update_available && matches!(d.state, DepState::Installed | DepState::System))
            || (d.state == DepState::Missing && state.settings().onboarded)
        {
            if let Err(e) = deps.install(d.id, progress_fn(&app)).await {
                log::warn!("auto-update failed: {e:#}");
            }
        }
    }
    if let Ok(report) = deps.report(false).await {
        let _ = app.emit(EVT_DEPS_CHANGED, &report);
    }
}
