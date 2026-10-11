//! System tray icon. Like a chat app, the window's X hides ymd next to the clock (downloads
//! keep running and «Descargar con ymd» answers at once); «Salir» in the icon's menu quits.
//! When the tray cannot be created (some Linux desktops), the X closes ymd as before.

use crate::model::{Language, Settings};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime, Window, WindowEvent};

pub const TRAY_ID: &str = "main";
const MENU_OPEN: &str = "open";
const MENU_QUIT: &str = "quit";

/// Menu labels for the tray, in ymd's language.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TrayLabels {
    pub open: &'static str,
    pub quit: &'static str,
}

/// Labels for `lang`; `System` follows `system_locale` (a BCP 47 / POSIX tag) and, like the
/// UI, falls back to Spanish.
pub fn tray_labels(lang: Language, system_locale: Option<&str>) -> TrayLabels {
    let english = match lang {
        Language::En => true,
        Language::Es => false,
        Language::System => system_locale
            .map(|l| l.trim().to_ascii_lowercase())
            .is_some_and(|l| l.starts_with("en") && !l[2..].starts_with(char::is_alphabetic)),
    };
    if english {
        TrayLabels {
            open: "Open ymd",
            quit: "Quit",
        }
    } else {
        TrayLabels {
            open: "Abrir ymd",
            quit: "Salir",
        }
    }
}

/// What the window's X does: hide to the tray (and whether this is the first time, which
/// deserves the one-time notice) or close normally.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseAction {
    Close,
    Hide { first_time: bool },
}

pub fn close_action(settings: &Settings, tray_ready: bool) -> CloseAction {
    if settings.close_to_tray && tray_ready {
        CloseAction::Hide {
            first_time: !settings.tray_hint_shown,
        }
    } else {
        CloseAction::Close
    }
}

fn system_locale() -> Option<String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Globalization::GetUserDefaultLocaleName;
        let mut buf = [0u16; 85];
        // SAFETY: the buffer is LOCALE_NAME_MAX_LENGTH wide, as the API requires.
        let n = unsafe { GetUserDefaultLocaleName(buf.as_mut_ptr(), buf.len() as i32) };
        if n > 1 {
            return Some(String::from_utf16_lossy(&buf[..(n - 1) as usize]));
        }
    }
    ["LC_ALL", "LC_MESSAGES", "LANG"]
        .iter()
        .filter_map(|k| std::env::var(k).ok())
        .find(|v| !v.is_empty())
}

fn build_menu<R: Runtime>(app: &AppHandle<R>, lang: Language) -> tauri::Result<Menu<R>> {
    let labels = tray_labels(lang, system_locale().as_deref());
    let open = MenuItem::with_id(app, MENU_OPEN, labels.open, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, MENU_QUIT, labels.quit, true, None::<&str>)?;
    Menu::with_items(app, &[&open, &quit])
}

/// Creates the tray icon; `false` when the platform has no tray (the X then quits).
pub fn create<R: Runtime>(app: &AppHandle<R>, lang: Language) -> bool {
    let build = || -> tauri::Result<()> {
        let mut tray = TrayIconBuilder::with_id(TRAY_ID)
            .tooltip("ymd")
            .menu(&build_menu(app, lang)?)
            .show_menu_on_left_click(false)
            .on_menu_event(|app, event| match event.id.as_ref() {
                MENU_OPEN => crate::open_url::focus_main(app),
                // Same path as closing the last window: Tauri exits and the child processes
                // (kill_on_drop + process group / job) go with it.
                MENU_QUIT => app.exit(0),
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    crate::open_url::focus_main(tray.app_handle());
                }
            });
        if let Some(icon) = app.default_window_icon() {
            tray = tray.icon(icon.clone());
        }
        tray.build(app)?;
        Ok(())
    };
    match build() {
        Ok(()) => true,
        Err(e) => {
            log::warn!("tray: not available, the window's X will quit ymd: {e}");
            false
        }
    }
}

/// Re-labels the menu after a language change.
pub fn relabel<R: Runtime>(app: &AppHandle<R>, lang: Language) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        if let Ok(menu) = build_menu(app, lang) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

/// `on_window_event` hook: the main window's X hides it to the tray when the setting asks for
/// it; the first time, the setting remembers it and the UI is told to show the notice.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    let WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    if window.label() != "main" {
        return;
    }
    let app = window.app_handle();
    let Some(state) = app.try_state::<std::sync::Arc<crate::state::AppState>>() else {
        return;
    };
    let tray_ready = app.tray_by_id(TRAY_ID).is_some();
    match close_action(&state.settings(), tray_ready) {
        CloseAction::Close => {}
        CloseAction::Hide { first_time } => {
            api.prevent_close();
            let _ = window.hide();
            if first_time {
                let saved = {
                    let mut s = state.settings.write().expect("settings lock");
                    s.tray_hint_shown = true;
                    s.clone()
                };
                if let Err(e) = crate::settings::save(&state.paths().settings_file(), &saved) {
                    log::warn!("tray: cannot save the notice flag: {e:#}");
                }
                let _ = app.emit(crate::model::EVT_HIDDEN_TO_TRAY, ());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    const ES: TrayLabels = TrayLabels {
        open: "Abrir ymd",
        quit: "Salir",
    };
    const EN: TrayLabels = TrayLabels {
        open: "Open ymd",
        quit: "Quit",
    };

    #[test]
    fn labels_follow_the_language_setting() {
        assert_eq!(tray_labels(Language::Es, Some("en-US")), ES);
        assert_eq!(tray_labels(Language::En, Some("es-HN")), EN);
    }

    #[test]
    fn system_language_reads_the_locale_and_falls_back_to_spanish() {
        for en in ["en-US", "en_GB.UTF-8", "EN", "en"] {
            assert_eq!(tray_labels(Language::System, Some(en)), EN, "{en}");
        }
        for es in ["es-ES", "es_HN.UTF-8", "fr-FR", "eng", "", "C"] {
            assert_eq!(tray_labels(Language::System, Some(es)), ES, "{es}");
        }
        assert_eq!(tray_labels(Language::System, None), ES);
    }

    #[test]
    fn close_hides_only_with_the_setting_and_a_tray() {
        let mut s = crate::settings::defaults(Path::new("/v"), Path::new("/a"));
        assert_eq!(
            close_action(&s, true),
            CloseAction::Hide { first_time: true }
        );
        assert_eq!(close_action(&s, false), CloseAction::Close);
        s.tray_hint_shown = true;
        assert_eq!(
            close_action(&s, true),
            CloseAction::Hide { first_time: false }
        );
        s.close_to_tray = false;
        assert_eq!(close_action(&s, true), CloseAction::Close);
    }
}
