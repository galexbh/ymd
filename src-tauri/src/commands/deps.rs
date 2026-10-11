use super::State;
use crate::deps::manager::ProgressFn;
use crate::model::{
    CmdResult, CommandError, DepId, DepLevel, DepState, DepStatus, DepsReport, ErrorCode,
    EVT_DEPS_CHANGED, EVT_DEPS_PROGRESS,
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

/// Whether "install what's needed" installs `d`: missing required + recommended deps, with
/// Node.js only when no usable JS runtime was detected. A system Node that yt-dlp cannot use
/// (too old) leaves no runtime, so the managed one is installed next to it.
pub fn wanted_by_install_recommended(d: &DepStatus, report: &DepsReport) -> bool {
    let no_runtime = report.js_runtime.is_none();
    let wanted = match d.level {
        DepLevel::Required => true,
        DepLevel::Recommended => d.id != DepId::Node || no_runtime,
        DepLevel::Optional => false,
    };
    let absent = d.state == DepState::Missing
        || (d.id == DepId::Node && d.state == DepState::System && no_runtime);
    wanted && absent && d.can_install
}

/// Installs every required + recommended dependency that is missing (Node.js only when no
/// other JS runtime was detected).
#[tauri::command]
pub async fn deps_install_recommended(app: AppHandle, state: State<'_>) -> CmdResult<DepsReport> {
    let deps = state.deps.read().await.clone();
    let report = deps.report(false).await?;
    for d in &report.deps {
        if wanted_by_install_recommended(d, &report) {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{JsRuntimeInfo, JsRuntimeName};

    fn dep(id: DepId, level: DepLevel, state: DepState) -> DepStatus {
        DepStatus {
            id,
            level,
            state,
            version: None,
            path: None,
            latest: None,
            update_available: false,
            verified: false,
            can_install: true,
            manual_hint: None,
            error: None,
        }
    }

    fn report(deps: Vec<DepStatus>, runtime: bool) -> DepsReport {
        DepsReport {
            bin_dir: "bin".into(),
            deps,
            js_runtime: runtime.then(|| JsRuntimeInfo {
                name: JsRuntimeName::Node,
                path: "node".into(),
                version: Some("24.21.0".into()),
                managed: false,
            }),
            js_runtimes_found: vec![],
        }
    }

    fn wanted(deps: Vec<DepStatus>, runtime: bool) -> Vec<DepId> {
        let r = report(deps, runtime);
        r.deps
            .iter()
            .filter(|d| wanted_by_install_recommended(d, &r))
            .map(|d| d.id)
            .collect()
    }

    #[test]
    fn install_recommended_selection() {
        use DepLevel::*;
        use DepState::*;
        let deps = || {
            vec![
                dep(DepId::Ytdlp, Required, Missing),
                dep(DepId::Ffmpeg, Required, Installed),
                dep(DepId::Node, Recommended, Missing),
                dep(DepId::Aria2c, Optional, Missing),
            ]
        };
        assert_eq!(wanted(deps(), false), vec![DepId::Ytdlp, DepId::Node]);
        assert_eq!(wanted(deps(), true), vec![DepId::Ytdlp]);
        // A system Node yt-dlp rejected (no runtime): install the managed one.
        let sys = vec![dep(DepId::Node, Recommended, System)];
        assert_eq!(wanted(sys.clone(), false), vec![DepId::Node]);
        assert!(wanted(sys, true).is_empty());
        let mut manual = dep(DepId::Ffmpeg, Required, Missing);
        manual.can_install = false;
        assert!(wanted(vec![manual], false).is_empty());
    }
}
