//! Settings + presets persisted as JSON in the config dir. Owner: data agent (D).
//! Unknown/missing fields fall back to defaults (forward/backward compatible); writes are atomic.
//!
//! ## Loading
//! The file is merged over the defaults at the `serde_json::Value` level, field by field:
//! unknown fields are dropped, missing fields keep their default, and a field whose value
//! does not deserialize (wrong type, unknown enum tag) falls back to its default without
//! discarding its siblings. A file that is not valid JSON is copied to
//! `settings.json.bak-<timestamp>` and the defaults are returned.
//!
//! ## Builtin presets
//! Builtins are re-materialized from code on every load/sanitize so their format logic
//! stays current across app updates. The user may still customise a builtin's
//! `postprocess` and `output_dir`; those two fields are carried over by id. Every other
//! field (name, kind, video, audio) comes from code. A builtin that the user deleted comes
//! back. Custom presets are kept as-is (after validation), after the builtins.

use crate::model::{
    AudioFormat, AudioOptions, ClipboardWatch, CookieSource, Density, Language, MediaKind,
    PostProcess, Preset, Radius, Settings, ThemeMode, ThemeSettings, UpdateChannel, VideoContainer,
    VideoOptions,
};
use serde_json::{Map, Value};
use std::collections::HashSet;
use std::io::Write;
use std::path::Path;

/// Default output template. `.180B` truncates the title to 180 *bytes* (yt-dlp's `B`
/// precision modifier), so multi-byte titles cannot push a file name past the 255-byte
/// component limit / Windows `MAX_PATH` once the id and extension are appended.
pub const DEFAULT_FILENAME_TEMPLATE: &str = "%(title).180B [%(id)s].%(ext)s";
pub const DEFAULT_PRESET_ID: &str = "best";
pub const CONCURRENCY_MIN: u32 = 1;
pub const CONCURRENCY_MAX: u32 = 8;
pub const FONT_SCALE_MIN: f64 = 0.875;
pub const FONT_SCALE_MAX: f64 = 1.25;

/// Defaults: Videos/Music system folders, concurrency 3, nightly channel, auto-update on,
/// cookies off, builtin presets, theme = system.
pub fn defaults(video_dir: &Path, audio_dir: &Path) -> Settings {
    Settings {
        language: Language::System,
        theme: ThemeSettings {
            mode: ThemeMode::System,
            accent: None,
            density: Density::Comfortable,
            radius: Radius::Soft,
            font_scale: 1.0,
        },
        video_dir: video_dir.to_string_lossy().into_owned(),
        audio_dir: audio_dir.to_string_lossy().into_owned(),
        ask_each_time: false,
        filename_template: DEFAULT_FILENAME_TEMPLATE.to_string(),
        concurrency: 3,
        bin_dir: None,
        ytdlp_channel: UpdateChannel::Nightly,
        auto_update: true,
        use_download_archive: false,
        use_aria2c: false,
        cookies: CookieSource::None,
        presets: builtin_presets(),
        default_preset_id: DEFAULT_PRESET_ID.to_string(),
        onboarded: false,
        clipboard_watch: ClipboardWatch::Known,
    }
}

fn default_postprocess() -> PostProcess {
    PostProcess {
        embed_thumbnail: true,
        embed_metadata: true,
        embed_subs: false,
        sub_langs: String::new(),
        sponsorblock_remove: Vec::new(),
    }
}

fn video_preset(id: &str, name: &str, max_height: Option<u32>) -> Preset {
    Preset {
        id: id.to_string(),
        name: name.to_string(),
        kind: MediaKind::Video,
        video: VideoOptions {
            max_height,
            container: VideoContainer::Mp4,
        },
        audio: AudioOptions {
            format: AudioFormat::Best,
            quality: "0".to_string(),
        },
        postprocess: default_postprocess(),
        output_dir: None,
        builtin: true,
    }
}

fn audio_preset(id: &str, name: &str, format: AudioFormat, quality: &str) -> Preset {
    Preset {
        id: id.to_string(),
        name: name.to_string(),
        kind: MediaKind::Audio,
        video: VideoOptions {
            max_height: None,
            container: VideoContainer::Mp4,
        },
        audio: AudioOptions {
            format,
            quality: quality.to_string(),
        },
        postprocess: default_postprocess(),
        output_dir: None,
        builtin: true,
    }
}

/// Builtin presets: best, mp4-1080, mp4-720, mp3-320, m4a, audio-original.
///
/// Ids are stable (the UI maps them to i18n keys); `name` is a Spanish-neutral fallback.
/// `best` uses container Mp4: the args builder sorts with `-S res,ext:mp4:m4a` and merges
/// with `--merge-output-format mp4`, which is a remux (no re-encode) and yields the most
/// widely playable file while still picking the highest resolution available.
pub fn builtin_presets() -> Vec<Preset> {
    vec![
        video_preset("best", "Mejor calidad", None),
        video_preset("mp4-1080", "MP4 1080p", Some(1080)),
        video_preset("mp4-720", "MP4 720p", Some(720)),
        audio_preset("mp3-320", "MP3 320", AudioFormat::Mp3, "320K"),
        // AAC in an m4a container; YouTube already serves AAC, so this usually remuxes only.
        audio_preset("m4a", "M4A (AAC)", AudioFormat::M4a, "0"),
        audio_preset(
            "audio-original",
            "Audio original (m4a/opus)",
            AudioFormat::Best,
            "0",
        ),
    ]
}

pub fn load(file: &Path, defaults: Settings) -> Settings {
    let raw = match std::fs::read_to_string(file) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return sanitize(defaults),
        Err(e) => {
            log::warn!("settings: cannot read {}: {e}", file.display());
            return sanitize(defaults);
        }
    };
    let user = match serde_json::from_str::<Value>(&raw) {
        Ok(v @ Value::Object(_)) => v,
        Ok(_) | Err(_) => {
            backup_corrupt(file);
            return sanitize(defaults);
        }
    };
    let merged = merge_settings(&defaults, &user);
    let mut out = sanitize(merged);
    // Empty folders on disk fall back to the platform defaults.
    if out.video_dir.is_empty() {
        out.video_dir = defaults.video_dir.clone();
    }
    if out.audio_dir.is_empty() {
        out.audio_dir = defaults.audio_dir.clone();
    }
    out
}

fn backup_corrupt(file: &Path) {
    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S%3f");
    let name = file
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "settings.json".to_string());
    let bak = file.with_file_name(format!("{name}.bak-{stamp}"));
    match std::fs::copy(file, &bak) {
        Ok(_) => log::warn!("settings: corrupt file backed up to {}", bak.display()),
        Err(e) => log::warn!("settings: corrupt file, backup failed: {e}"),
    }
}

pub fn save(file: &Path, settings: &Settings) -> anyhow::Result<()> {
    use anyhow::Context;
    let dir = match file.parent() {
        Some(d) if !d.as_os_str().is_empty() => d.to_path_buf(),
        _ => std::path::PathBuf::from("."),
    };
    std::fs::create_dir_all(&dir).with_context(|| format!("creating {}", dir.display()))?;
    let json = serde_json::to_vec_pretty(settings)?;
    let name = file
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "settings.json".to_string());
    let tmp = dir.join(format!(".{name}.tmp-{}", uuid::Uuid::new_v4().simple()));
    let result = (|| -> anyhow::Result<()> {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(&json)?;
        f.write_all(b"\n")?;
        f.sync_all()?;
        drop(f);
        std::fs::rename(&tmp, file)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result.with_context(|| format!("writing {}", file.display()))
}

/// Validation applied before saving (concurrency 1..=8, font_scale clamp, accent hex,
/// at least one preset, default preset exists, unique preset ids).
pub fn sanitize(settings: Settings) -> Settings {
    let mut s = settings;

    s.concurrency = s.concurrency.clamp(CONCURRENCY_MIN, CONCURRENCY_MAX);

    s.theme.font_scale = if s.theme.font_scale.is_finite() {
        s.theme.font_scale.clamp(FONT_SCALE_MIN, FONT_SCALE_MAX)
    } else {
        1.0
    };
    s.theme.accent = s.theme.accent.as_deref().and_then(normalize_accent);

    s.filename_template = sanitize_template(&s.filename_template);
    s.video_dir = s.video_dir.trim().to_string();
    s.audio_dir = s.audio_dir.trim().to_string();
    s.bin_dir = s
        .bin_dir
        .map(|d| d.trim().to_string())
        .filter(|d| !d.is_empty());
    if let CookieSource::Browser { profile, .. } = &mut s.cookies {
        *profile = profile
            .take()
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty());
    }

    s.presets = sanitize_presets(std::mem::take(&mut s.presets));

    let wanted = s.default_preset_id.trim().to_string();
    s.default_preset_id = if s.presets.iter().any(|p| p.id == wanted) {
        wanted
    } else {
        s.presets[0].id.clone()
    };
    s
}

fn normalize_accent(a: &str) -> Option<String> {
    let a = a.trim();
    let hex = a.strip_prefix('#')?;
    (hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit()))
        .then(|| format!("#{}", hex.to_ascii_lowercase()))
}

/// Trimmed template; falls back to the default when empty, absolute, or escaping the
/// target folder through a `..` segment. Relative subfolders (`%(uploader)s/...`) are fine.
pub fn sanitize_template(t: &str) -> String {
    let t = t.trim();
    if t.is_empty() || is_absolute_like(t) || t.split(['/', '\\']).any(|seg| seg.trim() == "..") {
        return DEFAULT_FILENAME_TEMPLATE.to_string();
    }
    t.to_string()
}

fn is_absolute_like(t: &str) -> bool {
    if t.starts_with('/') || t.starts_with('\\') || t.starts_with('~') {
        return true;
    }
    // Windows drive (`C:`), checked on every OS so a synced settings file stays safe.
    let b = t.as_bytes();
    b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':'
}

/// `"0".."10"` (VBR) or a bitrate `\d+K`.
pub fn is_valid_audio_quality(q: &str) -> bool {
    if let Some(n) = q.strip_suffix(['K', 'k']) {
        return !n.is_empty() && n.len() <= 5 && n.bytes().all(|b| b.is_ascii_digit());
    }
    !q.is_empty() && q.len() <= 2 && q.bytes().all(|b| b.is_ascii_digit()) && {
        let n: u32 = q.parse().unwrap_or(99);
        n <= 10
    }
}

fn sanitize_presets(presets: Vec<Preset>) -> Vec<Preset> {
    let builtins = builtin_presets();
    let builtin_ids: HashSet<&str> = builtins.iter().map(|p| p.id.as_str()).collect();

    let mut seen = HashSet::new();
    let mut user_builtins: Vec<Preset> = Vec::new();
    let mut custom: Vec<Preset> = Vec::new();
    for mut p in presets {
        p.id = p.id.trim().to_string();
        if p.id.is_empty() {
            p.id = format!("custom-{}", uuid::Uuid::new_v4().simple());
        }
        // Dedupe: first occurrence wins.
        if !seen.insert(p.id.clone()) {
            continue;
        }
        if builtin_ids.contains(p.id.as_str()) {
            user_builtins.push(p);
        } else {
            p.builtin = false;
            custom.push(sanitize_preset(p));
        }
    }

    let mut out: Vec<Preset> = builtins
        .into_iter()
        .map(|mut b| {
            if let Some(u) = user_builtins.iter().find(|u| u.id == b.id) {
                b.postprocess = sanitize_postprocess(u.postprocess.clone());
                b.output_dir = clean_dir(u.output_dir.clone());
            }
            b
        })
        .collect();
    out.extend(custom);
    out
}

fn sanitize_preset(mut p: Preset) -> Preset {
    p.name = p.name.trim().to_string();
    if p.name.is_empty() {
        p.name = p.id.clone();
    }
    if p.video.max_height == Some(0) {
        p.video.max_height = None;
    }
    p.audio.quality = p.audio.quality.trim().to_ascii_uppercase();
    if !is_valid_audio_quality(&p.audio.quality) {
        p.audio.quality = "0".to_string();
    }
    p.postprocess = sanitize_postprocess(p.postprocess);
    p.output_dir = clean_dir(p.output_dir);
    p
}

fn sanitize_postprocess(mut pp: PostProcess) -> PostProcess {
    pp.sub_langs = pp.sub_langs.trim().to_string();
    let mut seen = HashSet::new();
    pp.sponsorblock_remove = pp
        .sponsorblock_remove
        .into_iter()
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty() && seen.insert(c.clone()))
        .collect();
    pp
}

fn clean_dir(d: Option<String>) -> Option<String> {
    d.map(|d| d.trim().to_string()).filter(|d| !d.is_empty())
}

// ───────────────────────────── JSON-level merge ─────────────────────────────

/// Merge a user JSON document over typed defaults, keeping every field that deserializes.
fn merge_settings(defaults: &Settings, user: &Value) -> Settings {
    let base = serde_json::to_value(defaults).expect("settings serialize");
    let mut user = user.clone();

    // Presets: merge each entry over a template so partial/older presets survive.
    if let Some(obj) = user.as_object_mut() {
        if let Some(list) = obj.get("presets").cloned() {
            match list {
                Value::Array(items) => {
                    let merged: Vec<Value> = items.iter().filter_map(merge_preset).collect();
                    obj.insert("presets".into(), Value::Array(merged));
                }
                _ => {
                    obj.remove("presets");
                }
            }
        }
    }

    let check = |v: &Value| serde_json::from_value::<Settings>(v.clone()).is_ok();
    let mut acc = base.clone();
    merge_checked(&mut acc, &mut Vec::new(), &base, &user, &check);
    serde_json::from_value(acc).unwrap_or_else(|_| defaults.clone())
}

fn merge_preset(user: &Value) -> Option<Value> {
    let obj = user.as_object()?;
    let id = obj.get("id")?.as_str()?.to_string();
    let mut template = builtin_presets()
        .into_iter()
        .find(|p| p.id == id)
        .unwrap_or_else(|| {
            let mut p = video_preset(&id, &id, None);
            p.builtin = false;
            p
        });
    template.id = id;
    let base = serde_json::to_value(&template).ok()?;
    let check = |v: &Value| serde_json::from_value::<Preset>(v.clone()).is_ok();
    let mut acc = base.clone();
    merge_checked(&mut acc, &mut Vec::new(), &base, user, &check);
    Some(acc)
}

/// Writes `user` into `acc` at `path`, keeping it only if the whole document still passes
/// `check`. When a whole object is rejected, recurse into the keys the default knows about.
fn merge_checked(
    acc: &mut Value,
    path: &mut Vec<String>,
    default: &Value,
    user: &Value,
    check: &dyn Fn(&Value) -> bool,
) {
    set_at(acc, path, user.clone());
    if check(acc) {
        return;
    }
    set_at(acc, path, default.clone());
    if let (Value::Object(d), Value::Object(u)) = (default, user) {
        for (k, dv) in d {
            if let Some(uv) = u.get(k) {
                path.push(k.clone());
                merge_checked(acc, path, dv, uv, check);
                path.pop();
            }
        }
    }
}

fn set_at(root: &mut Value, path: &[String], v: Value) {
    let mut cur = root;
    for k in path {
        if !cur.is_object() {
            *cur = Value::Object(Map::new());
        }
        cur = cur
            .as_object_mut()
            .expect("object")
            .entry(k.clone())
            .or_insert(Value::Null);
    }
    *cur = v;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audio_quality_rules() {
        for ok in ["0", "5", "10", "320K", "128k", "64K"] {
            assert!(is_valid_audio_quality(ok), "{ok}");
        }
        for bad in ["", "11", "-1", "K", "abc", "320", "3.5", "100", "320KB"] {
            assert!(!is_valid_audio_quality(bad), "{bad}");
        }
    }

    #[test]
    fn template_rules() {
        assert_eq!(
            sanitize_template("  %(title)s.%(ext)s "),
            "%(title)s.%(ext)s"
        );
        assert_eq!(
            sanitize_template("%(uploader)s/%(title)s.%(ext)s"),
            "%(uploader)s/%(title)s.%(ext)s"
        );
        for bad in [
            "",
            "   ",
            "../x.%(ext)s",
            "a/../../x",
            "a\\..\\x",
            "/etc/x",
            "\\\\server\\x",
            "C:\\x",
            "c:x",
            "~/x",
        ] {
            assert_eq!(sanitize_template(bad), DEFAULT_FILENAME_TEMPLATE, "{bad}");
        }
        // `..` inside a name is not traversal.
        assert_eq!(sanitize_template("a..b.%(ext)s"), "a..b.%(ext)s");
    }

    #[test]
    fn accent_rules() {
        assert_eq!(normalize_accent("#A1b2C3").as_deref(), Some("#a1b2c3"));
        assert_eq!(normalize_accent("a1b2c3"), None);
        assert_eq!(normalize_accent("#abc"), None);
        assert_eq!(normalize_accent("#gggggg"), None);
    }

    #[test]
    fn merge_keeps_valid_siblings_of_invalid_field() {
        let d = defaults(Path::new("/v"), Path::new("/a"));
        let user = serde_json::json!({
            "theme": { "mode": "dark", "density": "nope", "fontScale": 1.1 },
            "concurrency": "many",
            "language": "en"
        });
        let s = merge_settings(&d, &user);
        assert_eq!(s.theme.mode, ThemeMode::Dark);
        assert_eq!(s.theme.density, Density::Comfortable);
        assert_eq!(s.theme.font_scale, 1.1);
        assert_eq!(s.concurrency, 3);
        assert_eq!(s.language, Language::En);
    }
}
