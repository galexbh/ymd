use super::State;
use crate::model::{
    CmdResult, CommandError, EnqueueRequest, Job, JobId, ProbeResult, EVT_JOB_REMOVED,
};
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn probe(state: State<'_>, url: String) -> CmdResult<ProbeResult> {
    use crate::diagnostics::{elapsed_ms, wire_name, MSG_PROBE};
    use tracing::Instrument;
    let started = std::time::Instant::now();
    let result = async {
        let tools = state.tools().await;
        let auth = state.auth_args(None);
        // yt-dlp gets a throwaway copy of the jar (deleted when `_jar` drops).
        let (auth, _jar) = crate::auth::cookies::ephemeral_args(&auth, &state.paths().tmp_dir())?;
        crate::ytdlp::probe::probe(url.trim(), &tools, &auth).await
    }
    .instrument(tracing::info_span!("probe"))
    .await;
    // The link itself is never logged.
    match &result {
        Ok(_) => tracing::info!(
            duration_ms = elapsed_ms(started),
            outcome = "ok",
            "{MSG_PROBE}"
        ),
        Err(e) => tracing::warn!(
            duration_ms = elapsed_ms(started),
            outcome = "error",
            error_code = %wire_name(&e.code),
            "{MSG_PROBE}"
        ),
    }
    result
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
