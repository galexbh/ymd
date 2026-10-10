//! `yt-dlp -J` → `ProbeResult`. Owner: B.

use super::{args, errors};
use crate::deps::Tools;
use crate::model::{
    CmdResult, CommandError, ErrorCode, FormatInfo, PlaylistEntry, ProbeKind, ProbeResult,
};
use serde_json::Value;
use std::process::Stdio;
use std::time::Duration;

pub const PROBE_TIMEOUT: Duration = Duration::from_secs(60);

/// Run yt-dlp and parse. Errors are classified with `errors::classify`.
pub async fn probe(url: &str, tools: &Tools, auth_args: &[String]) -> CmdResult<ProbeResult> {
    probe_with_timeout(url, tools, auth_args, PROBE_TIMEOUT).await
}

pub async fn probe_with_timeout(
    url: &str,
    tools: &Tools,
    auth_args: &[String],
    timeout: Duration,
) -> CmdResult<ProbeResult> {
    let url = url.trim();
    if url.is_empty() {
        return Err(CommandError::new(ErrorCode::UnsupportedUrl, "empty URL"));
    }
    let Some(ytdlp) = tools.ytdlp.as_ref() else {
        return Err(CommandError::new(
            ErrorCode::BinaryMissing,
            "yt-dlp is not installed",
        ));
    };
    let child = crate::process::command(ytdlp)
        .args(args::probe_args(url, tools, auth_args))
        .envs(args::child_env(tools))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => CommandError::new(
                ErrorCode::BinaryMissing,
                format!("{}: {e}", ytdlp.display()),
            ),
            std::io::ErrorKind::PermissionDenied => CommandError::new(
                ErrorCode::PermissionDenied,
                format!("{}: {e}", ytdlp.display()),
            ),
            _ => CommandError::unknown(e),
        })?;

    // On timeout the future (and the child, `kill_on_drop`) is dropped, which kills yt-dlp.
    let output = match tokio::time::timeout(timeout, child.wait_with_output()).await {
        Ok(Ok(out)) => out,
        Ok(Err(e)) => return Err(CommandError::unknown(e)),
        Err(_) => {
            return Err(CommandError::new(
                ErrorCode::Network,
                format!("yt-dlp did not answer within {}s", timeout.as_secs()),
            ))
        }
    };
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !output.status.success() {
        let e = errors::to_job_error(&stderr);
        let detail = if e.detail.is_empty() {
            format!("yt-dlp exited with {}", output.status)
        } else {
            e.detail
        };
        return Err(CommandError::new(e.code, detail));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    // `-J` prints one JSON document; be lenient about stray lines around it.
    let json: Value = serde_json::from_str(stdout.trim())
        .or_else(|_| {
            stdout
                .lines()
                .rev()
                .find(|l| l.trim_start().starts_with('{'))
                .map(serde_json::from_str)
                .unwrap_or_else(|| serde_json::from_str(""))
        })
        .map_err(|e| CommandError::unknown(format!("invalid yt-dlp JSON: {e}")))?;
    parse(&json, url).map_err(|e| CommandError::unknown(format!("{e:#}")))
}

fn str_of(v: &Value, key: &str) -> Option<String> {
    v.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty() && *s != "none" && *s != "NA")
        .map(str::to_string)
}

fn f64_of(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(Value::as_f64).filter(|n| n.is_finite())
}

fn u64_of(v: &Value, key: &str) -> Option<u64> {
    v.get(key)
        .and_then(|n| n.as_u64().or_else(|| n.as_f64().map(|f| f.max(0.0) as u64)))
}

/// Codec field: `None` when absent, `null` or `"none"`.
fn codec(v: &Value, key: &str) -> Option<String> {
    str_of(v, key)
}

/// `thumbnail` if set, else the largest of `thumbnails` (yt-dlp sorts them ascending by preference).
fn best_thumbnail(v: &Value) -> Option<String> {
    if let Some(t) = str_of(v, "thumbnail") {
        return Some(t);
    }
    let list = v.get("thumbnails")?.as_array()?;
    list.iter()
        .enumerate()
        .filter_map(|(i, t)| {
            let url = str_of(t, "url")?;
            let area = u64_of(t, "width").unwrap_or(0) * u64_of(t, "height").unwrap_or(0);
            let pref = t.get("preference").and_then(Value::as_i64).unwrap_or(0);
            Some(((pref, area, i), url))
        })
        .max_by_key(|(k, _)| *k)
        .map(|(_, u)| u)
}

/// Keeps formats a person would choose between: drops storyboards and entries without any
/// known stream (no video and no audio codec).
fn is_meaningful(f: &Value) -> bool {
    let ext = str_of(f, "ext").unwrap_or_default();
    let note = str_of(f, "format_note").unwrap_or_default();
    if ext == "mhtml" || note.contains("storyboard") {
        return false;
    }
    codec(f, "vcodec").is_some() || codec(f, "acodec").is_some()
}

fn format_info(f: &Value) -> Option<FormatInfo> {
    let has_video = codec(f, "vcodec").is_some();
    Some(FormatInfo {
        format_id: str_of(f, "format_id")?,
        ext: str_of(f, "ext").unwrap_or_default(),
        height: if has_video {
            u64_of(f, "height").map(|h| h as u32)
        } else {
            None
        },
        fps: f64_of(f, "fps").filter(|_| has_video),
        vcodec: codec(f, "vcodec"),
        acodec: codec(f, "acodec"),
        abr: f64_of(f, "abr").filter(|a| *a > 0.0),
        filesize: u64_of(f, "filesize").or_else(|| u64_of(f, "filesize_approx")),
        note: str_of(f, "format_note"),
    })
}

fn is_playlist(json: &Value) -> bool {
    matches!(
        json.get("_type").and_then(Value::as_str),
        Some("playlist") | Some("multi_video")
    ) || json.get("entries").is_some_and(Value::is_array)
}

/// Pure: map yt-dlp's info JSON (single video or playlist) to `ProbeResult`.
pub fn parse(json: &Value, url: &str) -> anyhow::Result<ProbeResult> {
    anyhow::ensure!(json.is_object(), "yt-dlp JSON is not an object");
    let id = str_of(json, "id");
    let title = str_of(json, "title")
        .or_else(|| id.clone())
        .unwrap_or_else(|| url.to_string());
    let uploader = str_of(json, "uploader").or_else(|| str_of(json, "channel"));
    let extractor = str_of(json, "extractor").or_else(|| str_of(json, "extractor_key"));

    if is_playlist(json) {
        let entries: Vec<PlaylistEntry> = json
            .get("entries")
            .and_then(Value::as_array)
            .map(|list| {
                list.iter()
                    .enumerate()
                    .filter(|(_, e)| e.is_object())
                    .map(|(i, e)| PlaylistEntry {
                        index: (i + 1) as u32,
                        id: str_of(e, "id"),
                        title: str_of(e, "title"),
                        duration: f64_of(e, "duration"),
                        thumbnail: best_thumbnail(e),
                        url: str_of(e, "url").or_else(|| str_of(e, "webpage_url")),
                    })
                    .collect()
            })
            .unwrap_or_default();
        let thumbnail =
            best_thumbnail(json).or_else(|| entries.iter().find_map(|e| e.thumbnail.clone()));
        let duration = {
            let known: Vec<f64> = entries.iter().filter_map(|e| e.duration).collect();
            (!known.is_empty()).then(|| known.iter().sum())
        };
        return Ok(ProbeResult {
            kind: ProbeKind::Playlist,
            url: url.to_string(),
            id,
            title,
            uploader,
            duration,
            thumbnail,
            extractor,
            formats: vec![],
            max_height: None,
            entries,
        });
    }

    let formats: Vec<FormatInfo> = json
        .get("formats")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter(|f| is_meaningful(f))
                .filter_map(format_info)
                .collect()
        })
        .unwrap_or_default();
    let max_height = formats.iter().filter_map(|f| f.height).max().or_else(|| {
        codec(json, "vcodec")
            .and(u64_of(json, "height"))
            .map(|h| h as u32)
    });
    Ok(ProbeResult {
        kind: ProbeKind::Video,
        url: url.to_string(),
        id,
        title,
        uploader,
        duration: f64_of(json, "duration"),
        thumbnail: best_thumbnail(json),
        extractor,
        formats,
        max_height,
        entries: vec![],
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn minimal_video() {
        let r = parse(&json!({"id": "x", "formats": []}), "u").unwrap();
        assert_eq!(r.kind, ProbeKind::Video);
        assert_eq!(r.title, "x");
        assert_eq!(r.max_height, None);
    }

    #[test]
    fn thumbnail_picks_largest() {
        let v = json!({"title": "t", "thumbnails": [
            {"url": "a", "width": 120, "height": 90},
            {"url": "b", "width": 1280, "height": 720},
            {"url": "c", "width": 320, "height": 180}
        ]});
        assert_eq!(best_thumbnail(&v).as_deref(), Some("b"));
    }

    #[test]
    fn rejects_non_object() {
        assert!(parse(&json!([1]), "u").is_err());
    }

    #[tokio::test]
    async fn missing_binary() {
        let e = probe("https://x", &Tools::default(), &[])
            .await
            .unwrap_err();
        assert_eq!(e.code, ErrorCode::BinaryMissing);
        let tools = Tools {
            ytdlp: Some(std::env::temp_dir().join("ymd-definitely-missing-yt-dlp.exe")),
            ..Tools::default()
        };
        let e = probe("https://x", &tools, &[]).await.unwrap_err();
        assert_eq!(e.code, ErrorCode::BinaryMissing);
    }
}
