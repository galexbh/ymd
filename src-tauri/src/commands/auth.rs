use super::State;
use crate::model::{
    Browser, BrowserInfo, CmdResult, CommandError, CookieFileInfo, CookieSource, CookieTestResult,
    SiteCredential,
};

#[tauri::command]
pub async fn browsers_detect() -> CmdResult<Vec<BrowserInfo>> {
    tokio::task::spawn_blocking(crate::auth::browsers::detect)
        .await
        .map_err(CommandError::unknown)
}

#[tauri::command]
pub async fn cookies_snapshot(
    state: State<'_>,
    browser: Browser,
    profile: Option<String>,
) -> CmdResult<CookieFileInfo> {
    let tools = state.tools().await;
    crate::auth::cookies::snapshot(&tools, &state.paths(), browser, profile.as_deref()).await
}

#[tauri::command]
pub async fn cookies_import(state: State<'_>, path: String) -> CmdResult<CookieFileInfo> {
    crate::auth::cookies::import(&state.paths(), std::path::Path::new(&path))
}

#[tauri::command]
pub async fn cookies_info(state: State<'_>) -> CmdResult<Option<CookieFileInfo>> {
    Ok(crate::auth::cookies::info(&state.paths()))
}

#[tauri::command]
pub async fn cookies_clear(state: State<'_>) -> CmdResult<()> {
    crate::auth::cookies::clear(&state.paths())
}

/// Tests a cookie source without saving it.
#[tauri::command]
pub async fn cookies_test(state: State<'_>, source: CookieSource) -> CmdResult<CookieTestResult> {
    let tools = state.tools().await;
    let args = crate::auth::args_for(
        &source,
        &state.paths(),
        false,
        &crate::state::AppState::helper_exe(),
        None,
    );
    Ok(crate::auth::cookies::test(&tools, &args).await)
}

#[tauri::command]
pub async fn credentials_list(state: State<'_>) -> CmdResult<Vec<SiteCredential>> {
    Ok(state.keychain.list()?)
}

#[tauri::command]
pub async fn credentials_set(
    state: State<'_>,
    extractor: String,
    username: String,
    password: String,
) -> CmdResult<Vec<SiteCredential>> {
    state
        .keychain
        .set(extractor.trim(), username.trim(), &password)?;
    Ok(state.keychain.list()?)
}

#[tauri::command]
pub async fn credentials_delete(
    state: State<'_>,
    extractor: String,
) -> CmdResult<Vec<SiteCredential>> {
    state.keychain.delete(&extractor)?;
    Ok(state.keychain.list()?)
}
