use super::State;
use crate::auth::{native_host, native_registry};
use crate::model::{
    Browser, BrowserInfo, CmdResult, CommandError, CookieFileInfo, CookieSource, CookieTestResult,
    ErrorCode, ExtensionStatus, ExtensionSync, SiteCredential,
};
use tauri::Manager;

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
    let paths = state.paths();
    let args = crate::auth::args_for(
        &source,
        &paths,
        false,
        &crate::state::AppState::helper_exe(),
        None,
    );
    // yt-dlp gets a throwaway copy of the jar (deleted when `_jar` drops).
    let (args, _jar) = crate::auth::cookies::ephemeral_args(&args, &paths.tmp_dir())?;
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

/// State of the cookie bridge: host registration per browser, bundled extension folder and
/// the last sync the extension delivered. Owner: bridge agent.
#[tauri::command]
pub async fn extension_status(state: State<'_>) -> CmdResult<ExtensionStatus> {
    let paths = state.paths();
    let resource = state.app.path().resource_dir().ok();
    tokio::task::spawn_blocking(move || {
        let dev = cfg!(debug_assertions).then(|| {
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap_or(std::path::Path::new("."))
                .join("extension")
                .join("dist")
        });
        // Dev builds prefer the live `extension/dist`; release uses the bundled copy. An empty
        // folder (no extension built yet) does not count.
        let extension_dir = dev
            .into_iter()
            .chain(resource.map(|r| r.join("extension")))
            .find(|d| d.join("manifest.json").is_file())
            .map(|d| d.to_string_lossy().into_owned());
        let manifest = native_registry::manifest_path(&paths.data_dir);
        let last_sync = crate::auth::cookies::info(&paths).and_then(|info| {
            let browser = info.origin.strip_prefix("extension:")?.to_string();
            Some(ExtensionSync {
                at: info.created_at,
                browser,
                cookie_count: info.cookie_count,
                domains: info.domains,
            })
        });
        let default = crate::auth::default_browser::detect_info();
        ExtensionStatus {
            extension_id: native_host::EXTENSION_ID.to_string(),
            extension_dir,
            host_manifest: manifest
                .is_file()
                .then(|| manifest.to_string_lossy().into_owned()),
            targets: native_registry::status(&paths.data_dir),
            last_sync,
            default_browser: default.as_ref().and_then(|d| d.browser),
            default_browser_name: default.as_ref().map(|d| d.name.clone()),
            default_browser_chromium: default.as_ref().is_some_and(|d| d.chromium),
        }
    })
    .await
    .map_err(CommandError::unknown)
}

/// Launches (or focuses) `browser` for the extension setup. Chromium ignores internal pages
/// such as `brave://extensions` passed by another program, so the UI copies that address for
/// the user to paste.
#[tauri::command]
/// `browser: None` launches the default browser by its own executable (Chromium forks such as
/// Arc or Yandex have no yt-dlp browser key).
pub async fn extension_open_page(state: State<'_>, browser: Option<Browser>) -> CmdResult<()> {
    let _ = state;
    let (program, args) = tokio::task::spawn_blocking(move || match browser {
        Some(b) => crate::auth::browser_exe::launch_command(b),
        None => crate::auth::default_browser::detect_info()
            .and_then(|d| d.exe)
            .filter(|p| p.is_file())
            .map(|exe| (exe, Vec::new()))
            .ok_or_else(|| {
                CommandError::new(
                    crate::model::ErrorCode::BinaryMissing,
                    "could not find the default browser executable",
                )
            }),
    })
    .await
    .map_err(CommandError::unknown)??;
    let mut cmd = crate::process::command(&program);
    // The browser must outlive this call (and ymd).
    cmd.kill_on_drop(false)
        .args(&args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    let mut child = cmd.spawn().map_err(|e| {
        CommandError::new(
            ErrorCode::BinaryMissing,
            format!("{}: {e}", program.display()),
        )
    })?;
    // Reap it whenever it exits.
    tokio::spawn(async move {
        let _ = child.wait().await;
    });
    Ok(())
}
