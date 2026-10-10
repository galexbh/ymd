//! Tauri commands: thin async wrappers over the domain modules. Every command returns
//! `CmdResult<T>` so the UI always gets `{ code, detail }` on failure.

pub mod auth;
pub mod deps;
pub mod history;
pub mod jobs;
pub mod settings;

use crate::state::AppState;
use std::sync::Arc;

pub type State<'a> = tauri::State<'a, Arc<AppState>>;
