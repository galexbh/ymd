//! «Exportar diagnóstico»: a zip to attach to an issue.
//!
//! Contents: `info.txt` (versions, OS, a settings summary with no paths and no cookie data),
//! `logs/ymd.*.jsonl` (the last [`LOG_RETENTION_DAYS`](super::retention::LOG_RETENTION_DAYS) days, redacted again line by line) and
//! `timings.txt`. Never included: the history database, the download archive, cookie files or
//! the cookie jar, keychain data, the raw `settings.json`.

use super::redact::redact;
use super::retention::{log_files, max_age};
use super::timings::{timings_text, TIMINGS_JOBS};
use super::wire_name;
use crate::model::{CookieSource, DepsReport, Settings};
use std::fmt::Write as _;
use std::io::Write;
use std::path::Path;
use std::time::SystemTime;

/// `ymd-diagnostico-YYYYMMDD-HHMM.zip`.
pub fn default_file_name<Tz: chrono::TimeZone>(now: &chrono::DateTime<Tz>) -> String
where
    Tz::Offset: std::fmt::Display,
{
    format!("ymd-diagnostico-{}.zip", now.format("%Y%m%d-%H%M"))
}

/// What `info.txt` is built from.
pub struct InfoInput<'a> {
    pub app_version: &'a str,
    pub os: &'a str,
    pub os_version: String,
    pub arch: &'a str,
    pub locale: Option<String>,
    pub settings: &'a Settings,
    pub deps: Option<&'a DepsReport>,
}

fn cookie_kind(c: &CookieSource) -> &'static str {
    match c {
        CookieSource::None => "none",
        CookieSource::Browser { .. } => "browser",
        CookieSource::Extension => "extension",
    }
}

/// `info.txt`: versions and a settings summary. Only enums, booleans and numbers — no folder,
/// template, preset name, cookie or account data.
pub fn info_text(i: &InfoInput) -> String {
    let s = i.settings;
    let mut out = String::new();
    let _ = writeln!(out, "ymd diagnostics");
    let _ = writeln!(out);
    let _ = writeln!(out, "ymd version:      {}", i.app_version);
    let _ = writeln!(
        out,
        "OS:               {} {} ({})",
        i.os, i.os_version, i.arch
    );
    let _ = writeln!(
        out,
        "System locale:    {}",
        i.locale.as_deref().unwrap_or("unknown")
    );
    let _ = writeln!(out, "ymd language:     {}", wire_name(&s.language));
    let _ = writeln!(out);
    let _ = writeln!(out, "Tools");
    match i.deps {
        Some(r) => {
            for d in &r.deps {
                let _ = writeln!(
                    out,
                    "  {:<10} {:<10} {}{}",
                    wire_name(&d.id),
                    wire_name(&d.state),
                    d.version.as_deref().unwrap_or("-"),
                    if d.verified { " (verified)" } else { "" }
                );
            }
            match &r.js_runtime {
                Some(js) => {
                    let _ = writeln!(
                        out,
                        "  JS runtime: {} {}{}",
                        wire_name(&js.name),
                        js.version.as_deref().unwrap_or("?"),
                        if js.managed {
                            " (installed by ymd)"
                        } else {
                            " (system)"
                        }
                    );
                }
                None => {
                    let _ = writeln!(out, "  JS runtime: none");
                }
            }
        }
        None => {
            let _ = writeln!(out, "  (unavailable)");
        }
    }
    let _ = writeln!(out);
    let _ = writeln!(out, "Settings (summary)");
    let rows: [(&str, String); 17] = [
        ("theme", wire_name(&s.theme.mode)),
        ("concurrency", s.concurrency.to_string()),
        (
            "speed limit (MB/s)",
            s.limit_rate_mbps
                .map_or_else(|| "none".to_string(), |n| n.to_string()),
        ),
        ("yt-dlp channel", wire_name(&s.ytdlp_channel)),
        ("auto update", s.auto_update.to_string()),
        ("download archive", s.use_download_archive.to_string()),
        ("aria2c", s.use_aria2c.to_string()),
        ("ask folder each time", s.ask_each_time.to_string()),
        ("custom tools folder", s.bin_dir.is_some().to_string()),
        (
            "custom file name",
            (s.filename_template != crate::settings::DEFAULT_FILENAME_TEMPLATE).to_string(),
        ),
        ("cookie source", cookie_kind(&s.cookies).to_string()),
        ("presets", s.presets.len().to_string()),
        (
            "custom presets",
            s.presets.iter().filter(|p| !p.builtin).count().to_string(),
        ),
        ("clipboard watch", wire_name(&s.clipboard_watch)),
        ("close to tray", s.close_to_tray.to_string()),
        ("onboarded", s.onboarded.to_string()),
        ("font scale", s.theme.font_scale.to_string()),
    ];
    for (k, v) in rows {
        let _ = writeln!(out, "  {k:<22}{v}");
    }
    let _ = writeln!(out);
    let _ = writeln!(
        out,
        "Not included: history, download archive, cookies, passwords, keychain data, settings.json."
    );
    // Defense in depth: nothing above should need it.
    redact(&out)
}

/// Writes the diagnostics zip to `out` (through a `.part` file renamed at the end).
pub fn write_zip(out: &Path, info: &str, logs_dir: &Path, now: SystemTime) -> anyhow::Result<()> {
    let part = out.with_extension("zip.part");
    let result = (|| -> anyhow::Result<()> {
        let file = std::fs::File::create(&part)?;
        let mut zip = zip::ZipWriter::new(file);
        let opts = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        zip.start_file("info.txt", opts)?;
        zip.write_all(redact(info).as_bytes())?;

        let mut all_lines: Vec<String> = Vec::new();
        for f in log_files(logs_dir) {
            if now.duration_since(f.modified).unwrap_or_default() > max_age() {
                continue;
            }
            let Ok(bytes) = std::fs::read(&f.path) else {
                continue;
            };
            let text = String::from_utf8_lossy(&bytes);
            let mut clean = String::with_capacity(text.len());
            for line in text.lines() {
                let line = redact(line);
                clean.push_str(&line);
                clean.push('\n');
                all_lines.push(line);
            }
            let name = f
                .path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            zip.start_file(format!("logs/{name}"), opts)?;
            zip.write_all(clean.as_bytes())?;
        }

        zip.start_file("timings.txt", opts)?;
        zip.write_all(timings_text(all_lines.iter().map(String::as_str), TIMINGS_JOBS).as_bytes())?;
        zip.finish()?;
        Ok(())
    })();
    match result {
        Ok(()) => {
            std::fs::rename(&part, out)?;
            Ok(())
        }
        Err(e) => {
            let _ = std::fs::remove_file(&part);
            Err(e)
        }
    }
}

/// Entry names that must never appear in an export.
pub const FORBIDDEN_ENTRIES: &[&str] = &[
    "history.sqlite3",
    "download-archive.txt",
    "cookies.txt",
    "cookies.jar",
    "cookies.meta.json",
    "accounts.json",
    "settings.json",
];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{DepId, DepLevel, DepState, DepStatus, JsRuntimeInfo, JsRuntimeName};
    use std::io::Read;
    use std::time::Duration;

    pub(crate) fn settings() -> Settings {
        let mut s = crate::settings::defaults(
            Path::new(r"C:\Users\ana\Videos"),
            Path::new(r"C:\Users\ana\Music"),
        );
        s.bin_dir = Some("/home/ana/secret-tools".into());
        s.filename_template = "%(uploader)s-ana-private.%(ext)s".into();
        s.cookies = CookieSource::Browser {
            browser: crate::model::Browser::Firefox,
            profile: Some("ana-profile".into()),
        };
        s
    }

    fn report() -> DepsReport {
        DepsReport {
            bin_dir: r"C:\Users\ana\AppData\Local\ymd\bin".into(),
            deps: vec![DepStatus {
                id: DepId::Ytdlp,
                level: DepLevel::Required,
                state: DepState::Installed,
                version: Some("2026.10.01".into()),
                path: Some(r"C:\Users\ana\AppData\Local\ymd\bin\yt-dlp.exe".into()),
                latest: None,
                update_available: false,
                verified: true,
                can_install: true,
                manual_hint: None,
                error: None,
            }],
            js_runtime: Some(JsRuntimeInfo {
                name: JsRuntimeName::Node,
                path: "/home/ana/.local/share/ymd/bin/node".into(),
                version: Some("24.21.0".into()),
                managed: true,
            }),
            js_runtimes_found: vec![],
        }
    }

    fn info() -> String {
        info_text(&InfoInput {
            app_version: "9.9.9",
            os: "windows",
            os_version: "11".into(),
            arch: "x86_64",
            locale: Some("es-HN".into()),
            settings: &settings(),
            deps: Some(&report()),
        })
    }

    #[test]
    fn file_name_has_date_and_time() {
        let t = chrono::NaiveDate::from_ymd_opt(2026, 10, 9)
            .unwrap()
            .and_hms_opt(7, 5, 0)
            .unwrap()
            .and_utc();
        assert_eq!(default_file_name(&t), "ymd-diagnostico-20261009-0705.zip");
    }

    #[test]
    fn info_has_versions_and_no_personal_data() {
        let text = info();
        for want in [
            "ymd version:      9.9.9",
            "windows 11 (x86_64)",
            "es-HN",
            "ytdlp",
            "2026.10.01 (verified)",
            "JS runtime: node 24.21.0 (installed by ymd)",
            "cookie source         browser",
            "speed limit (MB/s)    none",
            "custom tools folder   true",
            "custom file name      true",
        ] {
            assert!(text.contains(want), "missing {want:?} in\n{text}");
        }
        for bad in [
            r"\ana", "/ana", "ana-", "Users", "firefox", "profile", "AppData", "%(",
        ] {
            assert!(!text.contains(bad), "leaked {bad:?} in\n{text}");
        }
    }

    const SECRETS: &[&str] = &[
        "hunter2",
        "SyntheticSidValue",
        "2fa-424242",
        "tok-abc",
        r"C:\\Users\\ana",
        "/home/ana",
    ];

    /// A token-shaped value built at runtime (no token-looking literal in the source).
    fn fake_token() -> String {
        format!("{}42", "Zm9vYmFy".repeat(5))
    }

    fn seed_logs(dir: &Path, now: SystemTime) {
        std::fs::create_dir_all(dir).unwrap();
        // raw lines as an older ymd (or a bug) might have written them: unredacted secrets
        let today = [
            r#"{"timestamp":"2026-10-10T10:00:00Z","level":"INFO","fields":{"message":"spawn","argv":"[\"--video-password\", \"hunter2\", \"--twofactor\", \"2fa-424242\", \"--cookies\", \"C:\\\\Users\\\\ana\\\\jar.txt\"]"},"target":"ymd_lib::jobs"}"#,
            r#"{"timestamp":"2026-10-10T10:00:01Z","level":"WARN","fields":{"message":"ERROR: https://www.youtube.com/watch?v=x&token=tok-abc Cookie: SID=SyntheticSidValue"},"target":"ymd_lib::jobs"}"#,
            r#"{"timestamp":"2026-10-10T10:00:02Z","level":"INFO","fields":{"message":"auth Bearer FAKE_TOKEN at /home/ana/x"},"target":"ymd_lib::jobs"}"#,
            r#"{"timestamp":"2026-10-10T10:00:09Z","level":"INFO","fields":{"message":"stage finished","stage":"downloading","duration_ms":8000,"outcome":"ok"},"target":"ymd_lib::jobs","span":{"id":"3f2a8d5e-1b2c-4d3e-8f9a-0b1c2d3e4f5a","kind":"video","preset":"best","name":"job"}}"#,
            r#"{"timestamp":"2026-10-10T10:00:10Z","level":"INFO","fields":{"message":"job finished","duration_ms":9000,"outcome":"done"},"target":"ymd_lib::jobs","span":{"id":"3f2a8d5e-1b2c-4d3e-8f9a-0b1c2d3e4f5a","kind":"video","preset":"best","name":"job"}}"#,
        ]
        .join("\n")
        .replace("FAKE_TOKEN", &fake_token());
        std::fs::write(dir.join("ymd.2026-10-10.jsonl"), today).unwrap();
        // too old: left out
        let old = dir.join("ymd.2026-09-01.jsonl");
        std::fs::write(&old, "{\"fields\":{\"message\":\"old\"}}\n").unwrap();
        std::fs::File::options()
            .write(true)
            .open(&old)
            .unwrap()
            .set_modified(now - Duration::from_secs(20 * 24 * 3600))
            .unwrap();
        // not a log: left out even though it sits in the folder
        std::fs::write(dir.join("cookies.txt"), "SID\tSyntheticSidValue").unwrap();
    }

    fn entries(zip_path: &Path) -> Vec<(String, String)> {
        let mut z = zip::ZipArchive::new(std::fs::File::open(zip_path).unwrap()).unwrap();
        (0..z.len())
            .map(|i| {
                let mut f = z.by_index(i).unwrap();
                let mut s = String::new();
                f.read_to_string(&mut s).unwrap();
                (f.name().unwrap().to_string(), s)
            })
            .collect()
    }

    #[test]
    fn zip_has_info_logs_and_timings_and_no_secrets() {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().join("data");
        let logs = data.join("logs");
        let now = SystemTime::now();
        seed_logs(&logs, now);
        // personal files next to the logs must never be picked up
        std::fs::write(data.join("history.sqlite3"), "db").unwrap();
        std::fs::write(data.join("download-archive.txt"), "youtube x").unwrap();
        let out = dir.path().join("ymd-diagnostico-20261010-1000.zip");
        write_zip(&out, &info(), &logs, now).unwrap();
        assert!(!out.with_extension("zip.part").exists());

        let entries = entries(&out);
        let names: Vec<&str> = entries.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(
            names,
            ["info.txt", "logs/ymd.2026-10-10.jsonl", "timings.txt"]
        );
        for forbidden in FORBIDDEN_ENTRIES {
            assert!(!names.iter().any(|n| n.ends_with(forbidden)), "{forbidden}");
        }
        for (name, body) in &entries {
            assert!(
                !body.contains(&fake_token()),
                "token leaked in {name}:\n{body}"
            );
            for secret in SECRETS {
                assert!(
                    !body.contains(secret),
                    "{secret:?} leaked in {name}:\n{body}"
                );
            }
            for personal in [r"\ana", "/ana", "ana-"] {
                assert!(
                    !body.contains(personal),
                    "{personal:?} leaked in {name}:\n{body}"
                );
            }
        }
        let (_, log) = &entries[1];
        for line in log.lines() {
            serde_json::from_str::<serde_json::Value>(line).expect("log lines stay JSON");
        }
        assert!(
            log.contains("--video-password\\\", \\\"[redacted]"),
            "{log}"
        );
        assert!(log.contains("--cookies\\\", \\\"[redacted]"), "{log}");
        assert!(log.contains("at ~/x"), "{log}");
        let (_, timings) = &entries[2];
        assert!(
            timings.contains("job 3f2a8d5e  video · preset best  → done in 9.0 s"),
            "{timings}"
        );
        assert!(timings.contains("downloading"), "{timings}");
    }

    #[test]
    fn zip_without_logs_still_has_info_and_timings() {
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("d.zip");
        write_zip(&out, "info", &dir.path().join("missing"), SystemTime::now()).unwrap();
        let names: Vec<String> = entries(&out).into_iter().map(|(n, _)| n).collect();
        assert_eq!(names, ["info.txt", "timings.txt"]);
    }
}
