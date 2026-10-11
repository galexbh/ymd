//! `timings.txt`: human-readable per-stage durations of the latest downloads, rebuilt from the
//! JSON log lines (`stage finished` / `job finished` events inside a `job` span).

use super::{MSG_DEP, MSG_JOB, MSG_PROBE, MSG_STAGE};
use serde_json::Value;
use std::collections::HashMap;
use std::fmt::Write as _;

/// Downloads listed in `timings.txt`.
pub const TIMINGS_JOBS: usize = 20;

#[derive(Debug, Default)]
struct JobTimes {
    id: String,
    preset: String,
    kind: String,
    stages: Vec<(String, u64, String)>,
    finished: Option<(String, u64, String, Option<String>)>,
    order: usize,
}

fn str_of<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}

fn secs(ms: u64) -> String {
    if ms < 1000 {
        format!("{ms} ms")
    } else {
        format!("{:.1} s", ms as f64 / 1000.0)
    }
}

/// Builds the report from JSON log lines (any order of files, oldest line first).
pub fn timings_text<'a>(lines: impl IntoIterator<Item = &'a str>, limit: usize) -> String {
    let mut jobs: HashMap<String, JobTimes> = HashMap::new();
    let mut probes: Vec<(String, u64, String)> = Vec::new();
    let mut deps: Vec<(String, String, u64, String)> = Vec::new();
    for (n, line) in lines.into_iter().enumerate() {
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let fields = &v["fields"];
        let msg = str_of(fields, "message");
        let ts = str_of(&v, "timestamp").to_string();
        let ms = fields["duration_ms"].as_u64().unwrap_or(0);
        let outcome = str_of(fields, "outcome").to_string();
        match msg {
            MSG_STAGE | MSG_JOB => {
                let span = &v["span"];
                let id = str_of(span, "id");
                if id.is_empty() {
                    continue;
                }
                let j = jobs.entry(id.to_string()).or_insert_with(|| JobTimes {
                    id: id.to_string(),
                    ..Default::default()
                });
                j.preset = str_of(span, "preset").to_string();
                j.kind = str_of(span, "kind").to_string();
                j.order = n;
                if msg == MSG_STAGE {
                    j.stages
                        .push((str_of(fields, "stage").to_string(), ms, outcome));
                } else {
                    let code = fields["error_code"].as_str().map(str::to_string);
                    j.finished = Some((ts, ms, outcome, code));
                }
            }
            MSG_PROBE => probes.push((ts, ms, outcome)),
            MSG_DEP => deps.push((ts, str_of(fields, "dep").to_string(), ms, outcome)),
            _ => {}
        }
    }

    let mut out = String::new();
    let _ = writeln!(out, "ymd — per-stage timings (newest first, times in UTC)");
    let _ = writeln!(out);
    let mut list: Vec<JobTimes> = jobs.into_values().collect();
    list.sort_by_key(|j| std::cmp::Reverse(j.order));
    let _ = writeln!(out, "Latest downloads");
    if list.is_empty() {
        let _ = writeln!(out, "  (none in the logs)");
    }
    for j in list.iter().take(limit) {
        let short: String = j.id.chars().take(8).collect();
        let (when, total, outcome, code) = match &j.finished {
            Some((ts, ms, outcome, code)) => (ts.as_str(), secs(*ms), outcome.as_str(), code),
            None => ("(unfinished)", "?".to_string(), "running", &None),
        };
        let code = code
            .as_deref()
            .map(|c| format!(" ({c})"))
            .unwrap_or_default();
        let _ = writeln!(
            out,
            "  {when}  job {short}  {} · preset {}  → {outcome}{code} in {total}",
            if j.kind.is_empty() { "?" } else { &j.kind },
            if j.preset.is_empty() { "?" } else { &j.preset },
        );
        for (stage, ms, outcome) in &j.stages {
            let note = if outcome == "ok" || outcome.is_empty() {
                String::new()
            } else {
                format!("  [{outcome}]")
            };
            let _ = writeln!(out, "      {stage:<16}{:>10}{note}", secs(*ms));
        }
    }
    let _ = writeln!(out);
    let _ = writeln!(out, "Latest link checks (probe)");
    if probes.is_empty() {
        let _ = writeln!(out, "  (none in the logs)");
    }
    for (ts, ms, outcome) in probes.iter().rev().take(limit) {
        let _ = writeln!(out, "  {ts}  {:>10}  {outcome}", secs(*ms));
    }
    let _ = writeln!(out);
    let _ = writeln!(out, "Latest dependency updates");
    if deps.is_empty() {
        let _ = writeln!(out, "  (none in the logs)");
    }
    for (ts, dep, ms, outcome) in deps.iter().rev().take(limit) {
        let _ = writeln!(out, "  {ts}  {dep:<10}{:>10}  {outcome}", secs(*ms));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn stage(id: &str, stage: &str, ms: u64) -> String {
        json!({"timestamp": "2026-10-10T10:00:00Z", "level": "INFO",
               "fields": {"message": MSG_STAGE, "stage": stage, "duration_ms": ms, "outcome": "ok"},
               "span": {"name": "job", "id": id, "preset": "best", "kind": "video"}})
        .to_string()
    }

    fn done(id: &str, ts: &str, ms: u64, outcome: &str, code: Option<&str>) -> String {
        json!({"timestamp": ts, "level": "INFO",
               "fields": {"message": MSG_JOB, "duration_ms": ms, "outcome": outcome, "error_code": code},
               "span": {"name": "job", "id": id, "preset": "audio", "kind": "audio"}})
        .to_string()
    }

    #[test]
    fn jobs_newest_first_with_stages() {
        let lines = [
            stage("aaaaaaaa-1", "downloading", 10_200),
            stage("aaaaaaaa-1", "merging", 1_900),
            done("aaaaaaaa-1", "2026-10-10T10:00:12Z", 12_400, "done", None),
            "not json".to_string(),
            stage("bbbbbbbb-2", "downloading", 300),
            done("bbbbbbbb-2", "2026-10-10T11:00:00Z", 350, "error", Some("bot_check")),
            json!({"timestamp": "2026-10-10T09:00:00Z", "fields": {"message": MSG_PROBE, "duration_ms": 2100, "outcome": "ok"}}).to_string(),
            json!({"timestamp": "2026-10-10T08:00:00Z", "fields": {"message": MSG_DEP, "dep": "ytdlp", "duration_ms": 5000, "outcome": "ok"}}).to_string(),
        ];
        let text = timings_text(lines.iter().map(String::as_str), 20);
        let b = text.find("job bbbbbbbb").unwrap();
        let a = text.find("job aaaaaaaa").unwrap();
        assert!(
            b < a,
            "newest first:
{text}"
        );
        let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
        for want in [
            "→ error (bot_check) in 350 ms",
            "→ done in 12.4 s",
            "downloading 10.2 s merging 1.9 s",
            "2026-10-10T09:00:00Z 2.1 s ok",
            "ytdlp 5.0 s ok",
        ] {
            assert!(
                flat.contains(want),
                "missing {want:?} in
{text}"
            );
        }
    }

    #[test]
    fn limit_and_empty() {
        let text = timings_text(std::iter::empty(), 20);
        assert_eq!(text.matches("(none in the logs)").count(), 3);
        let lines: Vec<String> = (0..5)
            .map(|i| done(&format!("job{i}xxxxx"), "t", 1, "done", None))
            .collect();
        let text = timings_text(lines.iter().map(String::as_str), 2);
        assert_eq!(text.matches("  job ").count(), 2, "{text}");
        assert!(text.contains("job job4xxxx") && text.contains("job job3xxxx"));
    }

    #[test]
    fn unfinished_jobs_are_marked() {
        let lines = [stage("cccccccc", "downloading", 5)];
        let text = timings_text(lines.iter().map(String::as_str), 20);
        assert!(text.contains("(unfinished)  job cccccccc"), "{text}");
    }
}
