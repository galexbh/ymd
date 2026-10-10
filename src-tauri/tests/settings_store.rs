//! Settings: defaults, load/merge/backup, builtin presets, sanitize, atomic save.

use pretty_assertions::assert_eq;
use std::path::{Path, PathBuf};
use ymd_lib::model::*;
use ymd_lib::settings::{self, builtin_presets, defaults, load, sanitize, save};

fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/settings")
        .join(name)
}

fn defs() -> Settings {
    defaults(Path::new("/videos"), Path::new("/music"))
}

/// Copies a fixture into a temp dir as `settings.json`.
fn staged(name: &str) -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("settings.json");
    std::fs::copy(fixture(name), &file).unwrap();
    (dir, file)
}

fn custom_preset(id: &str) -> Preset {
    Preset {
        id: id.into(),
        name: format!("Custom {id}"),
        kind: MediaKind::Audio,
        video: VideoOptions {
            max_height: None,
            container: VideoContainer::Any,
        },
        audio: AudioOptions {
            format: AudioFormat::Flac,
            quality: "0".into(),
        },
        postprocess: PostProcess {
            embed_thumbnail: false,
            embed_metadata: false,
            embed_subs: false,
            sub_langs: String::new(),
            sponsorblock_remove: vec![],
        },
        output_dir: None,
        builtin: false,
    }
}

fn ids(s: &Settings) -> Vec<&str> {
    s.presets.iter().map(|p| p.id.as_str()).collect()
}

// ───────────── defaults ─────────────

#[test]
fn defaults_snapshot() {
    insta::assert_json_snapshot!("settings_defaults", defs());
}

#[test]
fn defaults_are_already_sanitized() {
    assert_eq!(sanitize(defs()), defs());
}

#[test]
fn builtin_preset_ids_are_stable() {
    let p = builtin_presets();
    assert_eq!(
        p.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(),
        [
            "best",
            "mp4-1080",
            "mp4-720",
            "mp3-320",
            "m4a",
            "audio-original"
        ]
    );
    assert!(p.iter().all(|p| p.builtin && !p.name.is_empty()));
    assert!(p
        .iter()
        .all(|p| p.postprocess.embed_thumbnail && p.postprocess.embed_metadata));
    assert!(p.iter().all(|p| !p.postprocess.embed_subs));
    let mp3 = &p[3];
    assert_eq!(mp3.kind, MediaKind::Audio);
    assert_eq!(mp3.audio.format, AudioFormat::Mp3);
    assert_eq!(mp3.audio.quality, "320K");
    assert_eq!(p[1].video.max_height, Some(1080));
    assert_eq!(p[2].video.max_height, Some(720));
}

#[test]
fn default_template_limits_title_bytes() {
    assert!(defs().filename_template.contains("%(title).180B"));
}

#[test]
fn clipboard_watch_defaults_to_known_and_serializes_lowercase() {
    assert_eq!(defs().clipboard_watch, ClipboardWatch::Known);
    assert_eq!(ClipboardWatch::default(), ClipboardWatch::Known);
    let v = serde_json::to_value(defs()).unwrap();
    assert_eq!(v["clipboardWatch"], "known");
    for (w, tag) in [
        (ClipboardWatch::Off, "off"),
        (ClipboardWatch::Known, "known"),
        (ClipboardWatch::Any, "any"),
    ] {
        assert_eq!(serde_json::to_value(w).unwrap(), tag);
        assert_eq!(
            serde_json::from_value::<ClipboardWatch>(tag.into()).unwrap(),
            w
        );
    }
}

// ───────────── load ─────────────

#[test]
fn load_old_file_without_clipboard_watch_uses_default() {
    // v0_partial predates the field.
    let (_dir, file) = staged("v0_partial.json");
    let raw = std::fs::read_to_string(&file).unwrap();
    assert!(!raw.contains("clipboardWatch"));
    let s = load(&file, defs());
    assert_eq!(s.clipboard_watch, ClipboardWatch::Known);
    // siblings from the old file are kept
    assert_eq!(s.language, Language::Es);
    assert_eq!(s.concurrency, 5);

    // A complete pre-clipboard settings document also deserializes directly (IPC path).
    let mut old = serde_json::to_value(defs()).unwrap();
    old.as_object_mut().unwrap().remove("clipboardWatch");
    let direct: Settings = serde_json::from_value(old).unwrap();
    assert_eq!(direct.clipboard_watch, ClipboardWatch::Known);
}

#[test]
fn load_clipboard_watch_saved_value_and_invalid_fallback() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("settings.json");
    std::fs::write(&file, r#"{ "clipboardWatch": "any", "concurrency": 2 }"#).unwrap();
    let s = load(&file, defs());
    assert_eq!(s.clipboard_watch, ClipboardWatch::Any);
    assert_eq!(s.concurrency, 2);

    std::fs::write(&file, r#"{ "clipboardWatch": "off" }"#).unwrap();
    assert_eq!(load(&file, defs()).clipboard_watch, ClipboardWatch::Off);

    std::fs::write(&file, r#"{ "clipboardWatch": "always", "language": "en" }"#).unwrap();
    let s = load(&file, defs());
    assert_eq!(
        s.clipboard_watch,
        ClipboardWatch::Known,
        "unknown tag -> default"
    );
    assert_eq!(s.language, Language::En, "siblings survive");

    std::fs::write(&file, r#"{ "clipboardWatch": 3 }"#).unwrap();
    assert_eq!(load(&file, defs()).clipboard_watch, ClipboardWatch::Known);
}

#[test]
fn sanitize_keeps_clipboard_watch() {
    for w in [
        ClipboardWatch::Off,
        ClipboardWatch::Known,
        ClipboardWatch::Any,
    ] {
        let mut s = defs();
        s.clipboard_watch = w;
        assert_eq!(sanitize(s).clipboard_watch, w);
    }
}

#[test]
fn load_missing_file_returns_defaults() {
    let dir = tempfile::tempdir().unwrap();
    let s = load(&dir.path().join("nope/settings.json"), defs());
    assert_eq!(s, defs());
}

#[test]
fn load_corrupt_backs_up_and_returns_defaults() {
    let (dir, file) = staged("corrupt.json");
    let original = std::fs::read(&file).unwrap();
    let s = load(&file, defs());
    assert_eq!(s, defs());

    let backups: Vec<_> = std::fs::read_dir(dir.path())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .filter(|n| n.starts_with("settings.json.bak-"))
        .collect();
    assert_eq!(backups.len(), 1, "{backups:?}");
    assert_eq!(
        std::fs::read(dir.path().join(&backups[0])).unwrap(),
        original
    );
}

#[test]
fn load_non_object_json_is_treated_as_corrupt() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("settings.json");
    std::fs::write(&file, "[1,2,3]").unwrap();
    assert_eq!(load(&file, defs()), defs());
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 2);
}

#[test]
fn load_partial_old_version_merges_over_defaults() {
    let (_dir, file) = staged("v0_partial.json");
    let s = load(&file, defs());
    let d = defs();

    assert_eq!(s.language, Language::Es);
    assert_eq!(s.theme.mode, ThemeMode::Dark);
    // missing theme fields default
    assert_eq!(s.theme.density, d.theme.density);
    assert_eq!(s.theme.radius, d.theme.radius);
    assert_eq!(s.theme.font_scale, 1.0);
    assert_eq!(s.video_dir, "D:\\Media\\Videos");
    assert_eq!(s.audio_dir, "/music");
    assert_eq!(s.concurrency, 5);
    assert_eq!(s.filename_template, d.filename_template);
    assert_eq!(s.ytdlp_channel, UpdateChannel::Nightly);
    assert_eq!(s.cookies, CookieSource::None);

    // builtins re-materialized, custom kept (partial custom filled from template)
    assert_eq!(
        ids(&s),
        [
            "best",
            "mp4-1080",
            "mp4-720",
            "mp3-320",
            "m4a",
            "audio-original",
            "my-podcast"
        ]
    );
    let best = &s.presets[0];
    assert_eq!(best.name, "Mejor calidad");
    assert_eq!(best.kind, MediaKind::Video);
    assert!(best.builtin);
    assert!(!best.postprocess.embed_thumbnail);
    assert!(best.postprocess.embed_subs);
    assert_eq!(best.postprocess.sub_langs, "es.*");
    assert_eq!(best.postprocess.sponsorblock_remove, ["sponsor"]);
    assert_eq!(best.output_dir.as_deref(), Some("D:\\Media\\Best"));

    let pod = s.presets.iter().find(|p| p.id == "my-podcast").unwrap();
    assert_eq!(pod.name, "Podcast");
    assert_eq!(pod.kind, MediaKind::Audio);
    assert_eq!(pod.audio.format, AudioFormat::Opus);
    assert_eq!(pod.audio.quality, "5");
    assert!(!pod.builtin);
    assert_eq!(s.default_preset_id, "my-podcast");
}

#[test]
fn load_ignores_unknown_fields_and_keeps_known_ones() {
    let (_dir, file) = staged("future_unknown_fields.json");
    let s = load(&file, defs());
    assert_eq!(s.language, Language::En);
    assert_eq!(
        s.theme,
        ThemeSettings {
            mode: ThemeMode::Light,
            accent: Some("#3366ff".into()),
            density: Density::Compact,
            radius: Radius::Round,
            font_scale: 1.125,
        }
    );
    assert!(s.ask_each_time);
    assert_eq!(s.filename_template, "%(uploader)s/%(title)s.%(ext)s");
    assert_eq!(s.concurrency, 2);
    assert_eq!(s.ytdlp_channel, UpdateChannel::Stable);
    assert!(!s.auto_update && s.use_download_archive && s.use_aria2c && s.onboarded);
    assert_eq!(
        s.cookies,
        CookieSource::Browser {
            browser: Browser::Brave,
            profile: Some("Profile 1".into())
        }
    );
    // empty preset list -> builtins come back
    assert_eq!(ids(&s), ids(&defs()));
    assert_eq!(s.default_preset_id, "mp3-320");
}

#[test]
fn load_invalid_values_fall_back_per_field() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("settings.json");
    std::fs::write(
        &file,
        r#"{
            "language": "klingon",
            "concurrency": 50,
            "theme": { "mode": "dark", "fontScale": "big", "accent": "red" },
            "cookies": { "kind": "browser", "browser": "netscape" },
            "presets": [ 42, { "name": "no id" }, { "id": "x", "kind": "hologram" } ],
            "videoDir": "   ",
            "onboarded": true
        }"#,
    )
    .unwrap();
    let s = load(&file, defs());
    assert_eq!(s.language, Language::System);
    assert_eq!(s.concurrency, 8);
    assert_eq!(s.theme.mode, ThemeMode::Dark);
    assert_eq!(s.theme.font_scale, 1.0);
    assert_eq!(s.theme.accent, None);
    assert_eq!(s.cookies, CookieSource::None);
    assert_eq!(s.video_dir, "/videos", "blank dir falls back to default");
    assert!(s.onboarded);
    // `x` kept with its invalid kind defaulted
    assert_eq!(ids(&s).last(), Some(&"x"));
    assert_eq!(s.presets.last().unwrap().kind, MediaKind::Video);
}

// ───────────── builtin presets merge ─────────────

#[test]
fn builtins_rematerialized_with_user_overrides_and_customs_kept() {
    let mut s = defs();
    // User tampers with a builtin: only postprocess/outputDir should survive.
    let best = s.presets.iter_mut().find(|p| p.id == "best").unwrap();
    best.name = "Hacked".into();
    best.video.max_height = Some(144);
    best.builtin = false;
    best.postprocess.embed_subs = true;
    best.postprocess.sub_langs = " en.* ".into();
    best.output_dir = Some(" /custom/best ".into());
    // User deletes a builtin and adds customs.
    s.presets.retain(|p| p.id != "mp4-720");
    s.presets.insert(0, custom_preset("my-flac"));
    s.presets.push(Preset {
        builtin: true, // lies about being builtin
        ..custom_preset("fake-builtin")
    });

    let out = sanitize(s);
    assert_eq!(
        ids(&out),
        [
            "best",
            "mp4-1080",
            "mp4-720",
            "mp3-320",
            "m4a",
            "audio-original",
            "my-flac",
            "fake-builtin"
        ]
    );
    let best = &out.presets[0];
    let code = &builtin_presets()[0];
    assert_eq!(best.name, code.name);
    assert_eq!(best.video, code.video);
    assert!(best.builtin);
    assert!(best.postprocess.embed_subs);
    assert_eq!(best.postprocess.sub_langs, "en.*");
    assert_eq!(best.output_dir.as_deref(), Some("/custom/best"));
    assert_eq!(out.presets[2], builtin_presets()[2]);
    assert_eq!(out.presets[6], custom_preset("my-flac"));
    assert!(!out.presets[7].builtin);
}

// ───────────── sanitize ─────────────

#[test]
fn sanitize_clamps_concurrency() {
    for (input, want) in [(0, 1), (1, 1), (3, 3), (8, 8), (9, 8), (u32::MAX, 8)] {
        let s = sanitize(Settings {
            concurrency: input,
            ..defs()
        });
        assert_eq!(s.concurrency, want, "{input}");
    }
}

#[test]
fn sanitize_clamps_font_scale() {
    for (input, want) in [
        (0.5, 0.875),
        (0.875, 0.875),
        (1.1, 1.1),
        (1.25, 1.25),
        (3.0, 1.25),
        (f64::NAN, 1.0),
        (f64::INFINITY, 1.0),
    ] {
        let mut s = defs();
        s.theme.font_scale = input;
        assert_eq!(sanitize(s).theme.font_scale, want, "{input}");
    }
}

#[test]
fn sanitize_validates_accent() {
    for (input, want) in [
        ("#FF8800", Some("#ff8800")),
        (" #a1b2c3 ", Some("#a1b2c3")),
        ("#fff", None),
        ("ff8800", None),
        ("#ff88zz", None),
        ("", None),
    ] {
        let mut s = defs();
        s.theme.accent = Some(input.into());
        assert_eq!(sanitize(s).theme.accent.as_deref(), want, "{input:?}");
    }
}

#[test]
fn sanitize_filename_template() {
    let cases = [
        ("  %(title)s.%(ext)s  ", "%(title)s.%(ext)s"),
        (
            "%(uploader)s/%(title)s.%(ext)s",
            "%(uploader)s/%(title)s.%(ext)s",
        ),
        ("", settings::DEFAULT_FILENAME_TEMPLATE),
        ("../%(title)s.%(ext)s", settings::DEFAULT_FILENAME_TEMPLATE),
        ("x/../../%(title)s", settings::DEFAULT_FILENAME_TEMPLATE),
        ("/abs/%(title)s", settings::DEFAULT_FILENAME_TEMPLATE),
        ("C:\\abs\\%(title)s", settings::DEFAULT_FILENAME_TEMPLATE),
    ];
    for (input, want) in cases {
        let s = sanitize(Settings {
            filename_template: input.into(),
            ..defs()
        });
        assert_eq!(s.filename_template, want, "{input:?}");
    }
}

#[test]
fn sanitize_dedupes_preset_ids_first_wins() {
    let mut s = defs();
    let mut second = custom_preset("dup");
    second.name = "Second".into();
    s.presets.push(custom_preset("dup"));
    s.presets.push(second);
    s.presets.push(builtin_presets()[0].clone());
    let out = sanitize(s);
    let dups: Vec<_> = out.presets.iter().filter(|p| p.id == "dup").collect();
    assert_eq!(dups.len(), 1);
    assert_eq!(dups[0].name, "Custom dup");
    assert_eq!(out.presets.iter().filter(|p| p.id == "best").count(), 1);
}

#[test]
fn sanitize_never_leaves_zero_presets() {
    let out = sanitize(Settings {
        presets: vec![],
        ..defs()
    });
    assert_eq!(ids(&out), ids(&defs()));
}

#[test]
fn sanitize_default_preset_must_exist() {
    let out = sanitize(Settings {
        default_preset_id: "ghost".into(),
        ..defs()
    });
    assert_eq!(out.default_preset_id, "best");

    let mut s = defs();
    s.presets.push(custom_preset("mine"));
    s.default_preset_id = " mine ".into();
    assert_eq!(sanitize(s).default_preset_id, "mine");
}

#[test]
fn sanitize_preset_fields() {
    let mut s = defs();
    let mut p = custom_preset("  spaced  ");
    p.name = "   ".into();
    p.audio.quality = "128k".into();
    p.video.max_height = Some(0);
    p.output_dir = Some("   ".into());
    p.postprocess.sponsorblock_remove = vec![" sponsor ".into(), "".into(), "sponsor".into()];
    s.presets.push(p);
    let mut bad_q = custom_preset("badq");
    bad_q.audio.quality = "loud".into();
    s.presets.push(bad_q);
    let mut no_id = custom_preset("");
    no_id.name = "Unnamed".into();
    s.presets.push(no_id);

    let out = sanitize(s);
    let p = out.presets.iter().find(|p| p.id == "spaced").unwrap();
    assert_eq!(p.name, "spaced");
    assert_eq!(p.audio.quality, "128K");
    assert_eq!(p.video.max_height, None);
    assert_eq!(p.output_dir, None);
    assert_eq!(p.postprocess.sponsorblock_remove, ["sponsor"]);
    let q = out.presets.iter().find(|p| p.id == "badq").unwrap();
    assert_eq!(q.audio.quality, "0");
    let unnamed = out.presets.iter().find(|p| p.name == "Unnamed").unwrap();
    assert!(unnamed.id.starts_with("custom-"));
}

#[test]
fn sanitize_audio_quality_accepts_valid_forms() {
    for q in ["0", "10", "320K", "96K"] {
        let mut s = defs();
        let mut p = custom_preset("q");
        p.audio.quality = q.into();
        s.presets.push(p);
        let out = sanitize(s);
        assert_eq!(out.presets.last().unwrap().audio.quality, q);
    }
}

#[test]
fn sanitize_trims_dirs_and_bin_dir() {
    let out = sanitize(Settings {
        video_dir: "  /v  ".into(),
        audio_dir: " /a".into(),
        bin_dir: Some("   ".into()),
        cookies: CookieSource::Browser {
            browser: Browser::Firefox,
            profile: Some("  ".into()),
        },
        ..defs()
    });
    assert_eq!(out.video_dir, "/v");
    assert_eq!(out.audio_dir, "/a");
    assert_eq!(out.bin_dir, None);
    assert_eq!(
        out.cookies,
        CookieSource::Browser {
            browser: Browser::Firefox,
            profile: None
        }
    );
}

#[test]
fn sanitize_is_idempotent() {
    let (_dir, file) = staged("v0_partial.json");
    let once = load(&file, defs());
    assert_eq!(sanitize(once.clone()), once);
}

// ───────────── save ─────────────

#[test]
fn save_then_load_round_trips() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("nested/config/settings.json");
    let mut s = defs();
    s.language = Language::En;
    s.theme.accent = Some("#112233".into());
    s.concurrency = 6;
    s.cookies = CookieSource::File;
    s.presets.push(custom_preset("my-flac"));
    s.default_preset_id = "my-flac".into();
    s.presets[0].output_dir = Some("/elsewhere".into());
    let s = sanitize(s);

    save(&file, &s).unwrap();
    let text = std::fs::read_to_string(&file).unwrap();
    assert!(text.contains("\n  \"language\": \"en\""), "pretty JSON");
    assert_eq!(load(&file, defs()), s);
}

#[test]
fn save_is_atomic_and_leaves_no_temp_files() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("settings.json");
    std::fs::write(&file, "old").unwrap();
    for i in 1..=3 {
        let s = Settings {
            concurrency: i,
            ..defs()
        };
        save(&file, &s).unwrap();
        assert_eq!(load(&file, defs()).concurrency, i);
    }
    let names: Vec<_> = std::fs::read_dir(dir.path())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(names, ["settings.json"]);
}

#[test]
fn save_fails_cleanly_when_target_is_a_directory() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("settings.json");
    std::fs::create_dir(&file).unwrap();
    assert!(save(&file, &defs()).is_err());
    let names: Vec<_> = std::fs::read_dir(dir.path())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(names, ["settings.json"], "temp file removed on failure");
}
