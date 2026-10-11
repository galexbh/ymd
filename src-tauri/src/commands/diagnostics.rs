use super::State;
use crate::diagnostics::export::{self, InfoInput};
use crate::model::{CmdResult, CommandError};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

/// ymd's data folder (history, logs, cookie copy): what «Abrir carpeta de datos» opens.
#[tauri::command]
pub fn app_data_dir(state: State<'_>) -> String {
    state.paths().data_dir.to_string_lossy().into_owned()
}

/// «Exportar diagnóstico»: asks where to save, writes the zip and returns its path; `None`
/// when the save dialog is cancelled. Built locally; nothing is uploaded.
#[tauri::command]
pub async fn diagnostics_export(app: AppHandle, state: State<'_>) -> CmdResult<Option<String>> {
    let name = export::default_file_name(&chrono::Local::now());
    let (tx, rx) = tokio::sync::oneshot::channel();
    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(&name)
        .add_filter("ZIP", &["zip"]);
    if let Ok(dir) = app.path().download_dir() {
        dialog = dialog.set_directory(dir);
    }
    dialog.save_file(move |picked| {
        let _ = tx.send(picked);
    });
    let Some(picked) = rx.await.ok().flatten() else {
        return Ok(None);
    };
    let mut out = picked
        .into_path()
        .map_err(|e| CommandError::unknown(format!("invalid save location: {e}")))?;
    if out.extension().is_none() {
        out.set_extension("zip");
    }

    let deps = state.deps.read().await.clone();
    let report = deps.report(false).await.ok();
    let settings = state.settings();
    let info = export::info_text(&InfoInput {
        app_version: env!("CARGO_PKG_VERSION"),
        os: std::env::consts::OS,
        os_version: tauri_plugin_os::version().to_string(),
        arch: std::env::consts::ARCH,
        locale: tauri_plugin_os::locale(),
        settings: &settings,
        deps: report.as_ref(),
    });
    let logs = state.paths().logs_dir();
    let target = out.clone();
    tokio::task::spawn_blocking(move || {
        export::write_zip(&target, &info, &logs, std::time::SystemTime::now())
    })
    .await
    .map_err(|e| CommandError::unknown(e.to_string()))??;
    tracing::info!("diagnostics exported");
    Ok(Some(out.to_string_lossy().into_owned()))
}
