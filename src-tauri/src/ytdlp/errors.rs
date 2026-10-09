//! Classifies yt-dlp stderr into stable `ErrorCode`s the UI turns into next steps. Owner: B.
//! Fixtures live in `tests/fixtures/stderr/*.txt`.

use crate::model::{ErrorCode, JobError};

pub fn classify(stderr: &str) -> ErrorCode {
    let _ = stderr;
    todo!("B")
}

/// Last meaningful `ERROR:` line (or last non-empty line) + its code.
pub fn to_job_error(stderr: &str) -> JobError {
    JobError {
        code: classify(stderr),
        detail: last_error_line(stderr),
    }
}

pub fn last_error_line(stderr: &str) -> String {
    stderr
        .lines()
        .rev()
        .find(|l| l.contains("ERROR"))
        .or_else(|| stderr.lines().rev().find(|l| !l.trim().is_empty()))
        .unwrap_or("")
        .trim()
        .to_string()
}
