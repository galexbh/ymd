//! Local diagnostics: structured logs on disk (never sent anywhere), redaction, retention and
//! the «Exportar diagnóstico» zip.
//!
//! Logged events never carry argv, cookie values, passwords or tokens: only ids, enums,
//! counts, durations and outcomes, plus error lines that pass through [`redact`] anyway.

pub mod export;
pub mod logging;
pub mod redact;
pub mod retention;
pub mod timings;

pub use redact::redact;

use crate::model::{JobStage, MediaKind};

/// Event messages `timings.txt` is rebuilt from.
pub const MSG_STAGE: &str = "stage finished";
pub const MSG_JOB: &str = "job finished";
pub const MSG_PROBE: &str = "probe finished";
pub const MSG_DEP: &str = "dependency update finished";
pub const MSG_COOKIES: &str = "cookie sync finished";

/// The wire name of a stage (`downloading`, `merging`, …).
pub fn stage_name(stage: JobStage) -> &'static str {
    match stage {
        JobStage::Queued => "queued",
        JobStage::Downloading => "downloading",
        JobStage::Merging => "merging",
        JobStage::Postprocessing => "postprocessing",
        JobStage::Done => "done",
        JobStage::Error => "error",
        JobStage::Canceled => "canceled",
    }
}

pub fn kind_name(kind: MediaKind) -> &'static str {
    match kind {
        MediaKind::Video => "video",
        MediaKind::Audio => "audio",
    }
}

/// The serde (wire) name of an enum value, e.g. `bot_check` for `ErrorCode::BotCheck`.
pub fn wire_name<T: serde::Serialize>(v: &T) -> String {
    match serde_json::to_value(v) {
        Ok(serde_json::Value::String(s)) => s,
        Ok(other) => other.to_string(),
        Err(_) => "?".into(),
    }
}

/// Milliseconds since `start`, saturating.
pub fn elapsed_ms(start: std::time::Instant) -> u64 {
    u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_match_the_wire_format() {
        for stage in [
            JobStage::Queued,
            JobStage::Downloading,
            JobStage::Merging,
            JobStage::Postprocessing,
            JobStage::Done,
            JobStage::Error,
            JobStage::Canceled,
        ] {
            assert_eq!(
                serde_json::to_value(stage).unwrap(),
                serde_json::Value::from(stage_name(stage))
            );
        }
        for kind in [MediaKind::Video, MediaKind::Audio] {
            assert_eq!(
                serde_json::to_value(kind).unwrap(),
                serde_json::Value::from(kind_name(kind))
            );
        }
    }
}
