//! Log retention: files older than [`LOG_RETENTION_DAYS`] go, and the folder is kept under
//! [`LOG_MAX_BYTES`] by deleting the oldest files first. Runs at startup and every 24 h.

use super::logging::{LOG_PREFIX, LOG_SUFFIX};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

pub const LOG_RETENTION_DAYS: u64 = 14;
pub const LOG_MAX_BYTES: u64 = 20 * 1024 * 1024;

pub fn max_age() -> Duration {
    Duration::from_secs(LOG_RETENTION_DAYS * 24 * 60 * 60)
}

/// `ymd.<anything>.jsonl`: only ymd's own log files are ever touched.
pub fn is_log_file(name: &str) -> bool {
    name.strip_prefix(LOG_PREFIX)
        .and_then(|r| r.strip_prefix('.'))
        .and_then(|r| r.strip_suffix(LOG_SUFFIX))
        .is_some_and(|mid| mid.len() > 1 && mid.ends_with('.'))
}

#[derive(Debug, Clone)]
pub struct LogFile {
    pub path: PathBuf,
    pub modified: SystemTime,
    pub len: u64,
}

/// ymd's log files in `dir`, oldest first (by modification time, then name).
pub fn log_files(dir: &Path) -> Vec<LogFile> {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut files: Vec<LogFile> = rd
        .filter_map(Result::ok)
        .filter(|e| is_log_file(&e.file_name().to_string_lossy()))
        .filter_map(|e| {
            let md = e.metadata().ok().filter(|m| m.is_file())?;
            Some(LogFile {
                path: e.path(),
                modified: md.modified().unwrap_or(SystemTime::UNIX_EPOCH),
                len: md.len(),
            })
        })
        .collect();
    files.sort_by(|a, b| a.modified.cmp(&b.modified).then(a.path.cmp(&b.path)));
    files
}

/// Deletes log files older than `max_age`, then the oldest ones until the rest fit in
/// `max_bytes` (the newest file, today's, is never deleted for size). Returns how many
/// files were removed.
pub fn prune_logs(dir: &Path, now: SystemTime, max_age: Duration, max_bytes: u64) -> usize {
    let mut removed = 0;
    let mut kept = Vec::new();
    for f in log_files(dir) {
        let age = now.duration_since(f.modified).unwrap_or_default();
        if age > max_age && std::fs::remove_file(&f.path).is_ok() {
            removed += 1;
        } else {
            kept.push(f);
        }
    }
    let mut total: u64 = kept.iter().map(|f| f.len).sum();
    let newest = kept.len().saturating_sub(1);
    for f in kept.iter().take(newest) {
        if total <= max_bytes {
            break;
        }
        if std::fs::remove_file(&f.path).is_ok() {
            total -= f.len;
            removed += 1;
        }
    }
    removed
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;

    const DAY: Duration = Duration::from_secs(24 * 60 * 60);

    fn file(dir: &Path, name: &str, bytes: usize, mtime: SystemTime) {
        let p = dir.join(name);
        std::fs::write(&p, vec![b'x'; bytes]).unwrap();
        File::options()
            .write(true)
            .open(&p)
            .unwrap()
            .set_modified(mtime)
            .unwrap();
    }

    fn names(dir: &Path) -> Vec<String> {
        let mut v: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        v.sort();
        v
    }

    #[test]
    fn recognizes_only_ymd_logs() {
        assert!(is_log_file("ymd.2026-10-10.jsonl"));
        assert!(!is_log_file("ymd.jsonl"));
        assert!(!is_log_file("history.sqlite3"));
        assert!(!is_log_file("ymd.2026-10-10.jsonl.bak"));
        assert!(!is_log_file("other.2026-10-10.jsonl"));
    }

    #[test]
    fn old_files_go_and_others_stay() {
        let dir = tempfile::tempdir().unwrap();
        let now = SystemTime::now();
        file(dir.path(), "ymd.2026-09-01.jsonl", 10, now - 20 * DAY);
        file(dir.path(), "ymd.2026-09-25.jsonl", 10, now - 15 * DAY);
        file(dir.path(), "ymd.2026-09-27.jsonl", 10, now - 13 * DAY);
        file(dir.path(), "ymd.2026-10-10.jsonl", 10, now);
        file(dir.path(), "notes.txt", 10, now - 30 * DAY);
        assert_eq!(prune_logs(dir.path(), now, max_age(), LOG_MAX_BYTES), 2);
        assert_eq!(
            names(dir.path()),
            ["notes.txt", "ymd.2026-09-27.jsonl", "ymd.2026-10-10.jsonl"]
        );
    }

    #[test]
    fn size_cap_deletes_oldest_first_but_keeps_the_newest() {
        let dir = tempfile::tempdir().unwrap();
        let now = SystemTime::now();
        file(dir.path(), "ymd.2026-10-07.jsonl", 400, now - 3 * DAY);
        file(dir.path(), "ymd.2026-10-08.jsonl", 400, now - 2 * DAY);
        file(dir.path(), "ymd.2026-10-09.jsonl", 400, now - DAY);
        file(dir.path(), "ymd.2026-10-10.jsonl", 400, now);
        assert_eq!(prune_logs(dir.path(), now, max_age(), 1000), 2);
        assert_eq!(
            names(dir.path()),
            ["ymd.2026-10-09.jsonl", "ymd.2026-10-10.jsonl"]
        );
        // a single oversized file (today's) is kept
        assert_eq!(prune_logs(dir.path(), now, max_age(), 100), 1);
        assert_eq!(names(dir.path()), ["ymd.2026-10-10.jsonl"]);
    }

    #[test]
    fn missing_dir_is_fine() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            prune_logs(&dir.path().join("nope"), SystemTime::now(), max_age(), 1),
            0
        );
    }
}
