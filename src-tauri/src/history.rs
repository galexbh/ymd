//! Download history in SQLite. Owner: D.

use crate::model::{HistoryItem, HistoryPage, HistoryQuery, Job, Preset};
use std::path::Path;
use std::sync::Mutex;

pub struct History {
    _conn: Mutex<rusqlite::Connection>,
}

impl History {
    pub fn open(path: &Path) -> anyhow::Result<Self> {
        let _ = path;
        todo!("D")
    }

    pub fn open_in_memory() -> anyhow::Result<Self> {
        todo!("D")
    }

    /// Record a completed job (needs `filepath`).
    pub fn record(&self, job: &Job, preset: &Preset) -> anyhow::Result<HistoryItem> {
        let _ = (job, preset);
        todo!("D")
    }

    /// Search title/url/filepath (case-insensitive), filter by kind, newest first; fills `exists`.
    pub fn query(&self, q: &HistoryQuery) -> anyhow::Result<HistoryPage> {
        let _ = q;
        todo!("D")
    }

    pub fn delete(&self, id: i64) -> anyhow::Result<()> {
        let _ = id;
        todo!("D")
    }

    pub fn clear(&self) -> anyhow::Result<()> {
        todo!("D")
    }
}
