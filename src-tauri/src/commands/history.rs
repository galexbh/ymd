use super::State;
use crate::model::{CmdResult, HistoryPage, HistoryQuery};

#[tauri::command]
pub async fn history_query(state: State<'_>, query: HistoryQuery) -> CmdResult<HistoryPage> {
    let h = state.history.clone();
    Ok(tokio::task::spawn_blocking(move || h.query(&query))
        .await
        .map_err(crate::model::CommandError::unknown)??)
}

#[tauri::command]
pub async fn history_delete(state: State<'_>, id: i64) -> CmdResult<()> {
    Ok(state.history.delete(id)?)
}

#[tauri::command]
pub async fn history_clear(state: State<'_>) -> CmdResult<()> {
    Ok(state.history.clear()?)
}
