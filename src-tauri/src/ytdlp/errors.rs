//! Classifies yt-dlp stderr into stable `ErrorCode`s the UI turns into next steps. Owner: B.
//! Fixtures live in `tests/fixtures/stderr/*.txt`.
//!
//! Rules are matched first against the `ERROR:` lines (what actually failed), then against the
//! whole stderr (warnings such as "No supported JavaScript runtime" explain a later
//! "Requested format is not available"). Order matters: YouTube's bot/age/private messages all
//! end with "Use --cookies-from-browser or --cookies", so they come before `LoginRequired`, and
//! "not made this video available in your country" must win over plain "unavailable".

use crate::model::{ErrorCode, JobError};

/// `(code, needles)`: a rule matches when any needle occurs in the lowercased text.
const RULES: &[(ErrorCode, &[&str])] = &[
    (
        ErrorCode::CookiesLocked,
        &["could not copy chrome cookie database", "cookie database is locked", "database is locked"],
    ),
    (
        ErrorCode::CookiesDecrypt,
        &[
            "failed to decrypt with dpapi",
            "failed to decrypt cookie",
            "cannot decrypt v20 cookies",
            "app-bound encryption",
            "app bound encryption",
            "failed to decrypt",
        ],
    ),
    (ErrorCode::BotCheck, &["not a bot", "confirm you\u{2019}re not a bot"]),
    (
        ErrorCode::AgeRestricted,
        &[
            "confirm your age",
            "age-restricted",
            "age restricted",
            "inappropriate for some users",
            "age verification",
        ],
    ),
    (ErrorCode::Private, &["private video", "this video is private", "is a private video"]),
    (
        ErrorCode::Geoblocked,
        &[
            "geo restriction",
            "geo-restricted",
            "geo restricted",
            "available in your country",
            "not available from your location",
            "blocked it in your country",
        ],
    ),
    (
        ErrorCode::LoginRequired,
        &[
            "--username",
            "account credentials",
            "login required",
            "requires authentication",
            "only available for registered users",
            "members-only",
            "join this channel",
            "this video is only available to music premium members",
            "sign in to view",
        ],
    ),
    (
        ErrorCode::Unavailable,
        &[
            "video unavailable",
            "this video is unavailable",
            "no longer available",
            "has been removed",
            "this video has been terminated",
            "account associated with this video has been terminated",
            "this live event will begin",
        ],
    ),
    (
        ErrorCode::FfmpegMissing,
        &[
            "ffmpeg is not installed",
            "ffprobe and ffmpeg not found",
            "ffmpeg not found",
            "ffprobe not found",
            "ffmpeg could not be found",
        ],
    ),
    (
        ErrorCode::JsRuntimeMissing,
        &[
            "no supported javascript runtime",
            "javascript runtime",
            "n challenge",
            "signature solving failed",
            "challenge solving failed",
            "yt-dlp-ejs",
            "wiki/ejs",
        ],
    ),
    (
        ErrorCode::DiskFull,
        &["no space left", "errno 28", "enospc", "not enough space on the disk", "winerror 112"],
    ),
    (
        ErrorCode::PermissionDenied,
        &["permission denied", "errno 13", "eacces", "access is denied", "winerror 5]"],
    ),
    (
        ErrorCode::UnsupportedUrl,
        &["unsupported url", "is not a valid url", "no video formats found", "no suitable extractor"],
    ),
    (
        ErrorCode::Network,
        &[
            "getaddrinfo failed",
            "failed to resolve",
            "name or service not known",
            "temporary failure in name resolution",
            "nodename nor servname",
            "timed out",
            "connection reset",
            "connection refused",
            "connection aborted",
            "remote end closed connection",
            "network is unreachable",
            "transporterror",
            "ssl:",
            "certificate verify failed",
            "unable to connect",
            "incompleteread",
            "http error 5",
            "http error 429",
        ],
    ),
];

fn match_rules(text: &str) -> ErrorCode {
    let lower = text.to_lowercase();
    if lower.trim().is_empty() {
        return ErrorCode::Unknown;
    }
    for (code, needles) in RULES {
        if needles.iter().any(|n| lower.contains(n)) {
            return *code;
        }
    }
    // A 404 from the generic extractor means the link is not a media page.
    if lower.contains("[generic]") && lower.contains("http error 404") {
        return ErrorCode::UnsupportedUrl;
    }
    ErrorCode::Unknown
}

pub fn classify(stderr: &str) -> ErrorCode {
    let errors: String = stderr
        .lines()
        .filter(|l| l.contains("ERROR"))
        .collect::<Vec<_>>()
        .join("\n");
    match match_rules(&errors) {
        ErrorCode::Unknown => match_rules(stderr),
        code => code,
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn errors_win_over_warnings() {
        let s = "WARNING: [youtube] No supported JavaScript runtime could be found.\n\
                 ERROR: [youtube] abc: Private video. Sign in if you've been granted access";
        assert_eq!(classify(s), ErrorCode::Private);
    }

    #[test]
    fn warning_explains_generic_error() {
        let s = "WARNING: [youtube] abc: n challenge solving failed: Some formats may be missing.\n\
                 ERROR: [youtube] abc: Requested format is not available. Use --list-formats";
        assert_eq!(classify(s), ErrorCode::JsRuntimeMissing);
    }

    #[test]
    fn empty_and_unknown() {
        assert_eq!(classify(""), ErrorCode::Unknown);
        assert_eq!(classify("ERROR: something odd happened"), ErrorCode::Unknown);
        let e = to_job_error("noise\nERROR: boom\n\n");
        assert_eq!(e.detail, "ERROR: boom");
    }

    #[test]
    fn generic_404_is_unsupported() {
        let s = "ERROR: [generic] notavideo: Unable to download webpage: HTTP Error 404: Not Found";
        assert_eq!(classify(s), ErrorCode::UnsupportedUrl);
    }
}
