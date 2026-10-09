//! Browser + profile discovery for `--cookies-from-browser`. Owner: C.
//! Brave is first-class: profiles come from `Local State` (`profile.info_cache`).

use crate::model::{BrowserInfo, BrowserProfile};

/// Installed browsers with their profiles, Brave first.
pub fn detect() -> Vec<BrowserInfo> {
    todo!("C")
}

/// Pure: Chromium `Local State` JSON → profiles (dir id + display name), Default first.
pub fn parse_chromium_local_state(json: &str) -> Vec<BrowserProfile> {
    let _ = json;
    todo!("C")
}

/// Pure: Firefox `profiles.ini` → profiles (path id + name), default first.
pub fn parse_firefox_profiles_ini(ini: &str) -> Vec<BrowserProfile> {
    let _ = ini;
    todo!("C")
}
