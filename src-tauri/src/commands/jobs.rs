use super::State;
use crate::model::{
    CmdResult, CommandError, EnqueueRequest, Job, JobId, PendingJob, ProbeResult, EVT_JOB_REMOVED,
};
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn probe(state: State<'_>, url: String) -> CmdResult<ProbeResult> {
    let tools = state.tools().await;
    let auth = state.auth_args(None);
    // yt-dlp gets a throwaway copy of the jar (deleted when `_jar` drops).
    let (auth, _jar) = crate::auth::cookies::ephemeral_args(&auth, &state.paths().tmp_dir())?;
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

/// Holds queued jobs until `at` (RFC 3339) or, with `None`, clears the schedule and starts
/// them now. Returns the stored schedule (`None` when `at` already passed).
#[tauri::command]
pub async fn queue_schedule(state: State<'_>, at: Option<String>) -> CmdResult<Option<String>> {
    let at = match at.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        None => None,
        Some(s) => Some(
            chrono::DateTime::parse_from_rfc3339(s)
                .map_err(|e| CommandError::unknown(format!("invalid time {s:?}: {e}")))?
                .with_timezone(&chrono::Utc),
        ),
    };
    state.jobs.set_start_at(at);
    Ok(schedule_string(&state))
}

/// Current scheduled queue start (RFC 3339, UTC), if any.
#[tauri::command]
pub async fn queue_schedule_get(state: State<'_>) -> CmdResult<Option<String>> {
    Ok(schedule_string(&state))
}

fn schedule_string(state: &State<'_>) -> Option<String> {
    state
        .jobs
        .start_at()
        .map(|t| t.to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
}

/// Accession number the next enqueued job will receive (shown on the intake card).
#[tauri::command]
pub async fn jobs_next_seq(state: State<'_>) -> CmdResult<u64> {
    Ok(state.jobs.next_seq().await)
}

/// Downloads a previous session left unfinished, minus the ones already back in the list.
#[tauri::command]
pub async fn jobs_pending(state: State<'_>) -> CmdResult<Vec<PendingJob>> {
    let active = state.jobs.ids().await;
    Ok(state
        .history
        .pending_list()?
        .into_iter()
        .filter(|p| !active.contains(&p.id))
        .collect())
}

/// Re-queues the given unfinished downloads with their id and number (the ones that need a
/// video password or 2FA code are skipped: those secrets were never stored).
#[tauri::command]
pub async fn jobs_resume(state: State<'_>, ids: Vec<JobId>) -> CmdResult<Vec<Job>> {
    let rows = state
        .history
        .pending_list()?
        .into_iter()
        .filter(|p| ids.contains(&p.id))
        .collect();
    Ok(state.jobs.resume(rows).await)
}

/// Forgets unfinished downloads and deletes their partial files in `tmp/<id>`.
#[tauri::command]
pub async fn jobs_discard_pending(state: State<'_>, ids: Vec<JobId>) -> CmdResult<()> {
    let active = state.jobs.ids().await;
    let tmp = state.paths().tmp_dir();
    for id in ids.iter().filter(|id| !active.contains(*id)) {
        state.history.pending_delete(id)?;
        crate::jobs::discard_tmp(&tmp, id);
    }
    Ok(())
}
