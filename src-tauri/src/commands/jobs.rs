use super::State;
use crate::model::{CmdResult, EnqueueRequest, Job, JobId, ProbeResult, EVT_JOB_REMOVED};
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn probe(state: State<'_>, url: String) -> CmdResult<ProbeResult> {
    let tools = state.tools().await;
    let auth = state.auth_args(None);
    crate::ytdlp::probe::probe(url.trim(), &tools, &auth).await
}

#[tauri::command]
pub async fn enqueue(state: State<'_>, req: EnqueueRequest) -> CmdResult<Job> {
    Ok(state.jobs.enqueue(req).await?)
}

#[tauri::command]
pub async fn jobs_list(state: State<'_>) -> CmdResult<Vec<Job>> {
    Ok(state.jobs.list().await)
}

#[tauri::command]
pub async fn job_cancel(state: State<'_>, id: JobId) -> CmdResult<()> {
    Ok(state.jobs.cancel(&id).await?)
}

#[tauri::command]
pub async fn job_retry(state: State<'_>, id: JobId) -> CmdResult<Job> {
    Ok(state.jobs.retry(&id).await?)
}

#[tauri::command]
pub async fn job_remove(app: AppHandle, state: State<'_>, id: JobId) -> CmdResult<()> {
    state.jobs.remove(&id).await?;
    let _ = app.emit(EVT_JOB_REMOVED, &id);
    Ok(())
}

#[tauri::command]
pub async fn jobs_clear_finished(app: AppHandle, state: State<'_>) -> CmdResult<Vec<JobId>> {
    let ids = state.jobs.clear_finished().await;
    for id in &ids {
        let _ = app.emit(EVT_JOB_REMOVED, id);
    }
    Ok(ids)
}
