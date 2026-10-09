//! Settings + presets persisted as JSON in the config dir. Owner: data agent (D).
//! Unknown/missing fields fall back to defaults (forward/backward compatible); writes are atomic.

use crate::model::{Preset, Settings};
use std::path::Path;

/// Defaults: Videos/Music system folders, concurrency 3, nightly channel, auto-update on,
/// cookies off, builtin presets, theme = system.
pub fn defaults(video_dir: &Path, audio_dir: &Path) -> Settings {
    let _ = (video_dir, audio_dir);
    todo!("D")
}

/// Builtin presets: best, mp4-1080, mp4-720, mp3-320, audio-original.
pub fn builtin_presets() -> Vec<Preset> {
    todo!("D")
}

pub fn load(file: &Path, defaults: Settings) -> Settings {
    let _ = (file, defaults);
    todo!("D")
}

pub fn save(file: &Path, settings: &Settings) -> anyhow::Result<()> {
    let _ = (file, settings);
    todo!("D")
}

/// Validation applied before saving (concurrency 1..=8, font_scale clamp, accent hex,
/// at least one preset, default preset exists, unique preset ids).
pub fn sanitize(settings: Settings) -> Settings {
    let _ = settings;
    todo!("D")
}
