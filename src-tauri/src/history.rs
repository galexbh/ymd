//! Download history in SQLite. Owner: D.
//!
//! Schema is versioned with `PRAGMA user_version` (see [`MIGRATIONS`]). Search is
//! case-insensitive for all of Unicode: a lowercased `haystack` column (title + url +
//! filepath) is written on insert and matched with `LIKE ... ESCAPE '\'` against the
//! lowercased, escaped query, so `%` and `_` in user input are literal.

use crate::model::{HistoryItem, HistoryPage, HistoryQuery, Job, MediaKind, Preset};
use anyhow::{bail, Context};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

pub const LIMIT_MIN: u32 = 1;
pub const LIMIT_MAX: u32 = 500;

/// Ordered migrations; index `i` upgrades `user_version` from `i` to `i + 1`.
const MIGRATIONS: &[&str] = &[
    // v1
    "CREATE TABLE IF NOT EXISTS downloads (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        url          TEXT NOT NULL,
        title        TEXT NOT NULL,
        filepath     TEXT NOT NULL,
        kind         TEXT NOT NULL,
        preset_name  TEXT NOT NULL,
        size         INTEGER,
        thumbnail    TEXT,
        extractor    TEXT,
        completed_at TEXT NOT NULL,
        haystack     TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_downloads_completed_at ON downloads(completed_at);",
    // v2: keep the accession number and the preset id with each archived download.
    "ALTER TABLE downloads ADD COLUMN seq INTEGER;
    ALTER TABLE downloads ADD COLUMN preset_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_downloads_seq ON downloads(seq);",
];

pub const SCHEMA_VERSION: i64 = MIGRATIONS.len() as i64;

pub struct History {
    conn: Mutex<Connection>,
}

impl History {
    pub fn open(path: &Path) -> anyhow::Result<Self> {
        if let Some(dir) = path.parent().filter(|d| !d.as_os_str().is_empty()) {
            std::fs::create_dir_all(dir).with_context(|| format!("creating {}", dir.display()))?;
        }
        let conn = Connection::open(path).with_context(|| format!("opening {}", path.display()))?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        let mode: String = conn.query_row("PRAGMA journal_mode=WAL", [], |r| r.get(0))?;
        if !mode.eq_ignore_ascii_case("wal") {
            log::warn!("history: journal_mode is {mode}, WAL unavailable");
        }
        Self::init(conn)
    }

    pub fn open_in_memory() -> anyhow::Result<Self> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(mut conn: Connection) -> anyhow::Result<Self> {
        migrate(&mut conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    fn conn(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Current `user_version` of the database.
    pub fn schema_version(&self) -> anyhow::Result<i64> {
        Ok(self
            .conn()
            .query_row("PRAGMA user_version", [], |r| r.get(0))?)
    }

    /// Highest id ever recorded (0 when empty). Used to keep job accession numbers
    /// increasing across sessions. `AUTOINCREMENT` means ids never go back down, even
    /// after deletes or `clear`.
    pub fn max_seq_hint(&self) -> u64 {
        let conn = self.conn();
        let from_seq: Option<i64> = conn
            .query_row(
                "SELECT seq FROM sqlite_sequence WHERE name = 'downloads'",
                [],
                |r| r.get(0),
            )
            .optional()
            .ok()
            .flatten();
        let from_max: Option<i64> = conn
            .query_row("SELECT MAX(id) FROM downloads", [], |r| r.get(0))
            .ok()
            .flatten();
        let from_job_seq: Option<i64> = conn
            .query_row("SELECT MAX(seq) FROM downloads", [], |r| r.get(0))
            .ok()
            .flatten();
        from_seq.max(from_max).max(from_job_seq).unwrap_or(0).max(0) as u64
    }

    /// Record a completed job (needs `filepath`).
    pub fn record(&self, job: &Job, preset: &Preset) -> anyhow::Result<HistoryItem> {
        let filepath = match job.filepath.as_deref().map(str::trim) {
            Some(p) if !p.is_empty() => p.to_string(),
            _ => bail!("job {} has no filepath; cannot record history", job.id),
        };
        let title = job
            .title
            .as_deref()
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .unwrap_or(&job.url)
            .to_string();
        let size = std::fs::metadata(&filepath)
            .ok()
            .filter(|m| m.is_file())
            .map(|m| m.len())
            .or(job.total_bytes);
        let completed_at = normalize_time(job.finished_at.as_deref());
        let kind = kind_str(job.kind);
        let haystack = haystack(&title, &job.url, &filepath, job.seq);
        let extractor: Option<String> = None;

        let conn = self.conn();
        conn.execute(
            "INSERT INTO downloads
                (url, title, filepath, kind, preset_name, size, thumbnail, extractor, completed_at, haystack, seq, preset_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                job.url,
                title,
                filepath,
                kind,
                preset.name,
                size.map(|s| s as i64),
                job.thumbnail,
                extractor,
                completed_at,
                haystack,
                job.seq as i64,
                preset.id,
            ],
        )?;
        let id = conn.last_insert_rowid();
        drop(conn);
        let exists = Path::new(&filepath).exists();
        Ok(HistoryItem {
            id,
            seq: Some(job.seq),
            preset_id: Some(preset.id.clone()),
            url: job.url.clone(),
            title,
            filepath,
            kind: job.kind,
            preset_name: preset.name.clone(),
            size,
            thumbnail: job.thumbnail.clone(),
            extractor,
            completed_at,
            exists,
        })
    }

    /// Search title/url/filepath (case-insensitive), filter by kind, newest first; fills `exists`.
    pub fn query(&self, q: &HistoryQuery) -> anyhow::Result<HistoryPage> {
        let limit = q.limit.clamp(LIMIT_MIN, LIMIT_MAX) as i64;
        let offset = q.offset as i64;
        let pattern = q
            .search
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| format!("%{}%", escape_like(&s.to_lowercase())));
        let kind = q.kind.map(kind_str);

        const WHERE: &str = "WHERE (?1 IS NULL OR haystack LIKE ?1 ESCAPE '\\')
                               AND (?2 IS NULL OR kind = ?2)";
        let conn = self.conn();
        let total: i64 = conn.query_row(
            &format!("SELECT COUNT(*) FROM downloads {WHERE}"),
            params![pattern, kind],
            |r| r.get(0),
        )?;
        let mut stmt = conn.prepare(&format!(
            "SELECT id, url, title, filepath, kind, preset_name, size, thumbnail, extractor, completed_at, seq, preset_id
             FROM downloads {WHERE}
             ORDER BY completed_at DESC, id DESC
             LIMIT ?3 OFFSET ?4"
        ))?;
        let rows = stmt.query_map(params![pattern, kind, limit, offset], |r| {
            let kind: String = r.get(4)?;
            let size: Option<i64> = r.get(6)?;
            let seq: Option<i64> = r.get(10)?;
            Ok(HistoryItem {
                id: r.get(0)?,
                seq: seq.and_then(|s| u64::try_from(s).ok()),
                preset_id: r.get(11)?,
                url: r.get(1)?,
                title: r.get(2)?,
                filepath: r.get(3)?,
                kind: parse_kind(&kind),
                preset_name: r.get(5)?,
                size: size.and_then(|s| u64::try_from(s).ok()),
                thumbnail: r.get(7)?,
                extractor: r.get(8)?,
                completed_at: r.get(9)?,
                exists: false,
            })
        })?;
        let mut items = rows.collect::<Result<Vec<_>, _>>()?;
        drop(stmt);
        drop(conn);
        for it in &mut items {
            it.exists = Path::new(&it.filepath).exists();
        }
        Ok(HistoryPage {
            items,
            total: total.max(0) as u64,
        })
    }

    pub fn delete(&self, id: i64) -> anyhow::Result<()> {
        self.conn()
            .execute("DELETE FROM downloads WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn clear(&self) -> anyhow::Result<()> {
        self.conn().execute("DELETE FROM downloads", [])?;
        Ok(())
    }
}

fn migrate(conn: &mut Connection) -> anyhow::Result<()> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if current > SCHEMA_VERSION {
        bail!("history database schema v{current} is newer than this app (v{SCHEMA_VERSION})");
    }
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current.max(0) as usize) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)
            .with_context(|| format!("history migration v{}", i + 1))?;
        tx.pragma_update(None, "user_version", (i + 1) as i64)?;
        tx.commit()?;
    }
    Ok(())
}

fn kind_str(k: MediaKind) -> &'static str {
    match k {
        MediaKind::Video => "video",
        MediaKind::Audio => "audio",
    }
}

fn parse_kind(s: &str) -> MediaKind {
    match s {
        "audio" => MediaKind::Audio,
        _ => MediaKind::Video,
    }
}

fn haystack(title: &str, url: &str, filepath: &str, seq: u64) -> String {
    // The accession number is searchable bare ("42") and zero-padded ("000042").
    format!("{title}\n{url}\n{filepath}\n{seq} {seq:06}").to_lowercase()
}

/// Escapes `\`, `%` and `_` for `LIKE ... ESCAPE '\'`.
fn escape_like(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if matches!(c, '\\' | '%' | '_') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// RFC3339 in UTC with millisecond precision so lexicographic order == chronological order.
fn normalize_time(t: Option<&str>) -> String {
    let dt = t
        .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
        .map(|d| d.with_timezone(&chrono::Utc))
        .unwrap_or_else(chrono::Utc::now);
    dt.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escape_like_escapes_wildcards() {
        assert_eq!(escape_like(r"50%_off\x"), r"50\%\_off\\x");
    }

    #[test]
    fn normalize_time_converts_to_utc() {
        assert_eq!(
            normalize_time(Some("2024-05-01T10:00:00-06:00")),
            "2024-05-01T16:00:00.000Z"
        );
        assert!(normalize_time(Some("garbage")).ends_with('Z'));
    }
}
