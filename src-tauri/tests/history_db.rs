//! History: record/query/delete/clear, search escaping, exists flag, migrations.

use pretty_assertions::assert_eq;
use std::path::Path;
use ymd_lib::history::{History, SCHEMA_VERSION};
use ymd_lib::model::*;
use ymd_lib::settings::builtin_presets;

fn job(n: u64, title: Option<&str>, filepath: Option<&str>, kind: MediaKind) -> Job {
    Job {
        id: format!("job-{n}"),
        seq: n,
        url: format!("https://example.com/watch?v={n}"),
        title: title.map(Into::into),
        thumbnail: Some(format!("https://img.example.com/{n}.jpg")),
        preset_id: "best".into(),
        kind,
        stage: JobStage::Done,
        progress: 1.0,
        downloaded_bytes: Some(1000 + n),
        total_bytes: Some(1000 + n),
        speed: None,
        eta: None,
        output_dir: "/out".into(),
        filepath: filepath.map(Into::into),
        error: None,
        playlist_index: None,
        playlist_count: None,
        created_at: "2024-01-01T00:00:00Z".into(),
        // Distinct, increasing completion times.
        finished_at: Some(format!("2024-01-01T00:{:02}:00Z", n % 60)),
    }
}

fn q(search: Option<&str>, kind: Option<MediaKind>, limit: u32, offset: u32) -> HistoryQuery {
    HistoryQuery {
        search: search.map(Into::into),
        kind,
        limit,
        offset,
    }
}

fn titles(p: &HistoryPage) -> Vec<&str> {
    p.items.iter().map(|i| i.title.as_str()).collect()
}

fn preset() -> Preset {
    builtin_presets().remove(0)
}

fn seeded() -> History {
    let h = History::open_in_memory().unwrap();
    let p = preset();
    let rows = [
        ("Plain video", "/out/plain.mp4", MediaKind::Video),
        ("50% off sale", "/out/sale.mp4", MediaKind::Video),
        ("snake_case talk", "/out/snake.mp4", MediaKind::Video),
        ("Canción ÁRBOL", "/out/cancion.mp3", MediaKind::Audio),
        ("Back\\slash", "/out/back.mp3", MediaKind::Audio),
        ("5000 off", "/out/5000.mp4", MediaKind::Video),
        ("snakeXcase", "/out/snakex.mp4", MediaKind::Video),
    ];
    for (i, (t, f, k)) in rows.iter().enumerate() {
        h.record(&job(i as u64 + 1, Some(t), Some(f), *k), &p)
            .unwrap();
    }
    h
}

#[test]
fn record_returns_item_and_query_lists_newest_first() {
    let h = seeded();
    let page = h.query(&q(None, None, 50, 0)).unwrap();
    assert_eq!(page.total, 7);
    assert_eq!(
        titles(&page),
        [
            "snakeXcase",
            "5000 off",
            "Back\\slash",
            "Canción ÁRBOL",
            "snake_case talk",
            "50% off sale",
            "Plain video"
        ]
    );
    let it = &page.items[6];
    assert_eq!(it.url, "https://example.com/watch?v=1");
    assert_eq!(it.preset_name, "Mejor calidad");
    assert_eq!(it.kind, MediaKind::Video);
    assert_eq!(
        it.thumbnail.as_deref(),
        Some("https://img.example.com/1.jpg")
    );
    assert_eq!(it.completed_at, "2024-01-01T00:01:00.000Z");
    assert_eq!(it.size, Some(1001), "missing file -> job.total_bytes");
}

#[test]
fn search_percent_and_underscore_are_literal() {
    let h = seeded();
    assert_eq!(
        titles(&h.query(&q(Some("50%"), None, 50, 0)).unwrap()),
        ["50% off sale"]
    );
    assert_eq!(
        titles(&h.query(&q(Some("snake_case"), None, 50, 0)).unwrap()),
        ["snake_case talk"]
    );
    assert_eq!(
        titles(&h.query(&q(Some("\\"), None, 50, 0)).unwrap()),
        ["Back\\slash"]
    );
    assert_eq!(h.query(&q(Some("%"), None, 50, 0)).unwrap().total, 1);
    assert_eq!(h.query(&q(Some("_"), None, 50, 0)).unwrap().total, 1);
}

#[test]
fn search_is_case_insensitive_including_unicode() {
    let h = seeded();
    for needle in ["canción", "CANCIÓN", "árbol", "ÁRBOL", "PLAIN"] {
        assert_eq!(
            h.query(&q(Some(needle), None, 50, 0)).unwrap().total,
            1,
            "{needle}"
        );
    }
}

#[test]
fn search_matches_url_and_filepath() {
    let h = seeded();
    assert_eq!(
        titles(&h.query(&q(Some("watch?v=3"), None, 50, 0)).unwrap()),
        ["snake_case talk"]
    );
    assert_eq!(
        titles(&h.query(&q(Some("/OUT/CANCION"), None, 50, 0)).unwrap()),
        ["Canción ÁRBOL"]
    );
    // Blank search = no filter.
    assert_eq!(h.query(&q(Some("   "), None, 50, 0)).unwrap().total, 7);
}

#[test]
fn kind_filter_and_combined_search() {
    let h = seeded();
    let audio = h.query(&q(None, Some(MediaKind::Audio), 50, 0)).unwrap();
    assert_eq!(audio.total, 2);
    assert!(audio.items.iter().all(|i| i.kind == MediaKind::Audio));
    assert_eq!(
        h.query(&q(None, Some(MediaKind::Video), 50, 0))
            .unwrap()
            .total,
        5
    );
    assert_eq!(
        h.query(&q(Some("off"), Some(MediaKind::Audio), 50, 0))
            .unwrap()
            .total,
        0
    );
}

#[test]
fn pagination_and_total() {
    let h = seeded();
    let p1 = h.query(&q(None, None, 3, 0)).unwrap();
    let p2 = h.query(&q(None, None, 3, 3)).unwrap();
    let p3 = h.query(&q(None, None, 3, 6)).unwrap();
    let p4 = h.query(&q(None, None, 3, 9)).unwrap();
    assert_eq!(
        (
            p1.items.len(),
            p2.items.len(),
            p3.items.len(),
            p4.items.len()
        ),
        (3, 3, 1, 0)
    );
    assert!([&p1, &p2, &p3, &p4].iter().all(|p| p.total == 7));
    let mut all: Vec<i64> = [p1, p2, p3]
        .iter()
        .flat_map(|p| p.items.iter().map(|i| i.id))
        .collect();
    all.dedup();
    assert_eq!(all.len(), 7);
}

#[test]
fn limit_is_clamped() {
    let h = seeded();
    assert_eq!(h.query(&q(None, None, 0, 0)).unwrap().items.len(), 1);
    let big = History::open_in_memory().unwrap();
    for i in 0..510 {
        big.record(
            &job(i, Some("x"), Some("/nope/x.mp4"), MediaKind::Video),
            &preset(),
        )
        .unwrap();
    }
    let page = big.query(&q(None, None, 10_000, 0)).unwrap();
    assert_eq!(page.items.len(), 500);
    assert_eq!(page.total, 510);
}

#[test]
fn exists_flag_and_size_from_filesystem() {
    let dir = tempfile::tempdir().unwrap();
    let present = dir.path().join("present.mp4");
    std::fs::write(&present, vec![0u8; 4321]).unwrap();
    let gone = dir.path().join("gone.mp4");

    let h = History::open_in_memory().unwrap();
    let a = h
        .record(
            &job(
                1,
                Some("present"),
                Some(present.to_str().unwrap()),
                MediaKind::Video,
            ),
            &preset(),
        )
        .unwrap();
    let b = h
        .record(
            &job(
                2,
                Some("gone"),
                Some(gone.to_str().unwrap()),
                MediaKind::Video,
            ),
            &preset(),
        )
        .unwrap();
    assert!(a.exists);
    assert_eq!(a.size, Some(4321));
    assert!(!b.exists);
    assert_eq!(b.size, Some(1002));

    let page = h.query(&q(None, None, 10, 0)).unwrap();
    let by_title = |t: &str| page.items.iter().find(|i| i.title == t).unwrap().exists;
    assert!(by_title("present"));
    assert!(!by_title("gone"));

    // Deleting the file flips the flag on the next query.
    std::fs::remove_file(&present).unwrap();
    let page = h.query(&q(None, None, 10, 0)).unwrap();
    assert!(page.items.iter().all(|i| !i.exists));
}

#[test]
fn record_without_filepath_errors() {
    let h = History::open_in_memory().unwrap();
    assert!(h
        .record(&job(1, Some("t"), None, MediaKind::Video), &preset())
        .is_err());
    assert!(h
        .record(&job(2, Some("t"), Some("  "), MediaKind::Video), &preset())
        .is_err());
    assert_eq!(h.query(&q(None, None, 10, 0)).unwrap().total, 0);
}

#[test]
fn title_falls_back_to_url() {
    let h = History::open_in_memory().unwrap();
    let a = h
        .record(&job(1, None, Some("/x/a.mp4"), MediaKind::Video), &preset())
        .unwrap();
    let b = h
        .record(
            &job(2, Some("  "), Some("/x/b.mp4"), MediaKind::Video),
            &preset(),
        )
        .unwrap();
    assert_eq!(a.title, "https://example.com/watch?v=1");
    assert_eq!(b.title, "https://example.com/watch?v=2");
}

#[test]
fn missing_finished_at_uses_now() {
    let h = History::open_in_memory().unwrap();
    let mut j = job(1, Some("t"), Some("/x/a.mp4"), MediaKind::Video);
    j.finished_at = None;
    let it = h.record(&j, &preset()).unwrap();
    assert!(chrono::DateTime::parse_from_rfc3339(&it.completed_at).is_ok());
    assert!(it.completed_at.as_str() > "2024-01-01");
}

#[test]
fn delete_and_clear() {
    let h = seeded();
    let first = h.query(&q(None, None, 1, 0)).unwrap().items[0].id;
    h.delete(first).unwrap();
    h.delete(999_999).unwrap(); // unknown id is a no-op
    let page = h.query(&q(None, None, 50, 0)).unwrap();
    assert_eq!(page.total, 6);
    assert!(page.items.iter().all(|i| i.id != first));
    h.clear().unwrap();
    assert_eq!(h.query(&q(None, None, 50, 0)).unwrap().total, 0);
}

#[test]
fn max_seq_hint_never_decreases() {
    let h = History::open_in_memory().unwrap();
    assert_eq!(h.max_seq_hint(), 0);
    for i in 1..=3 {
        h.record(
            &job(i, Some("t"), Some("/x/a.mp4"), MediaKind::Video),
            &preset(),
        )
        .unwrap();
    }
    assert_eq!(h.max_seq_hint(), 3);
    h.clear().unwrap();
    assert_eq!(h.max_seq_hint(), 3);
}

#[test]
fn open_creates_dirs_persists_and_uses_wal() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a/b/history.sqlite3");
    {
        let h = History::open(&path).unwrap();
        h.record(
            &job(1, Some("persisted"), Some("/x/a.mp4"), MediaKind::Audio),
            &preset(),
        )
        .unwrap();
        assert_eq!(h.schema_version().unwrap(), SCHEMA_VERSION);
    }
    let conn = rusqlite::Connection::open(&path).unwrap();
    let mode: String = conn
        .query_row("PRAGMA journal_mode", [], |r| r.get(0))
        .unwrap();
    assert_eq!(mode.to_lowercase(), "wal");
    drop(conn);

    let h = History::open(&path).unwrap();
    assert_eq!(
        titles(&h.query(&q(None, None, 10, 0)).unwrap()),
        ["persisted"]
    );
    assert_eq!(h.max_seq_hint(), 1);
}

#[test]
fn migrates_existing_v0_database() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("history.sqlite3");
    {
        // A v0 database: valid SQLite file, user_version 0, no tables.
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute_batch("CREATE TABLE unrelated(x); DROP TABLE unrelated;")
            .unwrap();
        let v: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, 0);
    }
    assert!(Path::new(&path).exists());
    let h = History::open(&path).unwrap();
    assert_eq!(h.schema_version().unwrap(), SCHEMA_VERSION);
    h.record(
        &job(
            1,
            Some("after migration"),
            Some("/x/a.mp4"),
            MediaKind::Video,
        ),
        &preset(),
    )
    .unwrap();
    assert_eq!(
        h.query(&q(Some("migration"), None, 10, 0)).unwrap().total,
        1
    );
    drop(h);
    // Re-open is a no-op migration.
    let h = History::open(&path).unwrap();
    assert_eq!(h.query(&q(None, None, 10, 0)).unwrap().total, 1);
}

#[test]
fn refuses_newer_schema() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("history.sqlite3");
    {
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.pragma_update(None, "user_version", SCHEMA_VERSION + 1)
            .unwrap();
    }
    assert!(History::open(&path).is_err());
}

#[test]
fn concurrent_records_from_threads() {
    let h = std::sync::Arc::new(History::open_in_memory().unwrap());
    let handles: Vec<_> = (0..8)
        .map(|t| {
            let h = h.clone();
            std::thread::spawn(move || {
                for i in 0..10 {
                    h.record(
                        &job(t * 100 + i, Some("t"), Some("/x/a.mp4"), MediaKind::Video),
                        &preset(),
                    )
                    .unwrap();
                }
            })
        })
        .collect();
    for th in handles {
        th.join().unwrap();
    }
    assert_eq!(h.query(&q(None, None, 500, 0)).unwrap().total, 80);
}
