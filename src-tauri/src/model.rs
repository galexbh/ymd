//! IPC contract shared with the frontend (`src/ipc/types.ts`).
//!
//! Every type here is serialized with `camelCase` field names and lowercase /
//! snake_case enum tags so the TypeScript mirror stays mechanical. Changing a
//! type here requires changing `src/ipc/types.ts` in the same commit.

use serde::{Deserialize, Serialize};

// ───────────────────────────── Dependencies ─────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DepId {
    Ytdlp,
    Ffmpeg,
    Deno,
    Aria2c,
    Atomicparsley,
}

impl DepId {
    pub const ALL: [DepId; 5] = [
        DepId::Ytdlp,
        DepId::Ffmpeg,
        DepId::Deno,
        DepId::Aria2c,
        DepId::Atomicparsley,
    ];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DepLevel {
    Required,
    Recommended,
    Optional,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DepState {
    /// Managed by ymd inside the bin dir.
    Installed,
    /// Found on the system (PATH / Homebrew), not managed by ymd.
    System,
    Missing,
    Installing,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DepStatus {
    pub id: DepId,
    pub level: DepLevel,
    pub state: DepState,
    pub version: Option<String>,
    pub path: Option<String>,
    pub latest: Option<String>,
    pub update_available: bool,
    /// Whether the last install was checked against a published checksum.
    pub verified: bool,
    /// ymd can download it for this OS/arch.
    pub can_install: bool,
    /// Copyable package-manager command when `can_install` is false (e.g. `brew install aria2`).
    pub manual_hint: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JsRuntimeName {
    Deno,
    Node,
    Bun,
    Quickjs,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsRuntimeInfo {
    pub name: JsRuntimeName,
    pub path: String,
    pub version: Option<String>,
    /// Installed by ymd (managed Deno) rather than found on PATH.
    pub managed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DepsReport {
    pub bin_dir: String,
    pub deps: Vec<DepStatus>,
    /// The runtime yt-dlp will be given via `--js-runtimes`, if any.
    pub js_runtime: Option<JsRuntimeInfo>,
    /// All runtimes detected, in priority order.
    pub js_runtimes_found: Vec<JsRuntimeInfo>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DepPhase {
    Resolving,
    Downloading,
    Verifying,
    Extracting,
    Done,
    Error,
}

/// Event `deps://progress`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DepProgress {
    pub id: DepId,
    pub phase: DepPhase,
    pub received: u64,
    pub total: Option<u64>,
    pub message: Option<String>,
}

// ───────────────────────────── Probe ─────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProbeKind {
    Video,
    Playlist,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatInfo {
    pub format_id: String,
    pub ext: String,
    pub height: Option<u32>,
    pub fps: Option<f64>,
    pub vcodec: Option<String>,
    pub acodec: Option<String>,
    pub abr: Option<f64>,
    pub filesize: Option<u64>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistEntry {
    /// 1-based index as understood by `--playlist-items`.
    pub index: u32,
    pub id: Option<String>,
    pub title: Option<String>,
    pub duration: Option<f64>,
    pub thumbnail: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub kind: ProbeKind,
    pub url: String,
    pub id: Option<String>,
    pub title: String,
    pub uploader: Option<String>,
    pub duration: Option<f64>,
    pub thumbnail: Option<String>,
    pub extractor: Option<String>,
    pub formats: Vec<FormatInfo>,
    /// Highest video height available (videos only).
    pub max_height: Option<u32>,
    pub entries: Vec<PlaylistEntry>,
}

// ───────────────────────────── Presets & settings ─────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    Video,
    Audio,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VideoContainer {
    Mp4,
    Mkv,
    Webm,
    Any,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioFormat {
    Best,
    Mp3,
    M4a,
    Opus,
    Flac,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoOptions {
    /// `None` = best available.
    pub max_height: Option<u32>,
    pub container: VideoContainer,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioOptions {
    pub format: AudioFormat,
    /// yt-dlp `--audio-quality`: "0".."10" (VBR) or a bitrate like "320K".
    pub quality: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostProcess {
    pub embed_thumbnail: bool,
    pub embed_metadata: bool,
    pub embed_subs: bool,
    /// e.g. "es.*,en.*". Empty = yt-dlp default.
    pub sub_langs: String,
    /// SponsorBlock categories to remove; empty = disabled.
    pub sponsorblock_remove: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub kind: MediaKind,
    pub video: VideoOptions,
    pub audio: AudioOptions,
    pub postprocess: PostProcess,
    /// Overrides the per-kind default folder.
    pub output_dir: Option<String>,
    pub builtin: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    System,
    Es,
    En,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Density {
    Comfortable,
    Compact,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Radius {
    Sharp,
    Soft,
    Round,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeSettings {
    pub mode: ThemeMode,
    /// Hex `#rrggbb`; `None` = the theme's own accent.
    pub accent: Option<String>,
    pub density: Density,
    pub radius: Radius,
    /// 0.875 – 1.25
    pub font_scale: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UpdateChannel {
    Stable,
    Nightly,
    Master,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Browser {
    Brave,
    Chrome,
    Chromium,
    Edge,
    Firefox,
    Opera,
    Safari,
    Vivaldi,
    Whale,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum CookieSource {
    None,
    /// Read live from the browser on each download.
    Browser {
        browser: Browser,
        profile: Option<String>,
    },
    /// Use the snapshot / imported cookies.txt in the app data dir.
    File,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub language: Language,
    pub theme: ThemeSettings,
    pub video_dir: String,
    pub audio_dir: String,
    /// Ask for a folder on every enqueue.
    pub ask_each_time: bool,
    /// yt-dlp output template, relative to the target folder.
    pub filename_template: String,
    pub concurrency: u32,
    /// `None` = platform default (`%LOCALAPPDATA%\ymd\bin` on Windows).
    pub bin_dir: Option<String>,
    pub ytdlp_channel: UpdateChannel,
    pub auto_update: bool,
    pub use_download_archive: bool,
    pub use_aria2c: bool,
    pub cookies: CookieSource,
    pub presets: Vec<Preset>,
    pub default_preset_id: String,
    pub onboarded: bool,
}

// ───────────────────────────── Jobs ─────────────────────────────

pub type JobId = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueRequest {
    pub url: String,
    pub preset_id: String,
    /// `None` = single video (`--no-playlist`). `Some(vec![])` = whole playlist.
    pub playlist_items: Option<Vec<u32>>,
    pub output_dir: Option<String>,
    /// Transient secrets: kept in memory for this job only, never persisted.
    pub video_password: Option<String>,
    pub twofactor: Option<String>,
    /// Display metadata from the probe, so the row is meaningful before yt-dlp reports.
    pub title: Option<String>,
    pub thumbnail: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobStage {
    Queued,
    Downloading,
    Merging,
    Postprocessing,
    Done,
    Error,
    Canceled,
}

impl JobStage {
    pub fn is_terminal(self) -> bool {
        matches!(self, JobStage::Done | JobStage::Error | JobStage::Canceled)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    BotCheck,
    AgeRestricted,
    LoginRequired,
    Private,
    Unavailable,
    Geoblocked,
    FfmpegMissing,
    JsRuntimeMissing,
    UnsupportedUrl,
    Network,
    CookiesLocked,
    CookiesDecrypt,
    DiskFull,
    PermissionDenied,
    BinaryMissing,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobError {
    pub code: ErrorCode,
    /// Last meaningful yt-dlp stderr line (English, raw) for the details view.
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: JobId,
    /// Monotonic accession number shown in the UI.
    pub seq: u64,
    pub url: String,
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    pub preset_id: String,
    pub kind: MediaKind,
    pub stage: JobStage,
    /// 0.0 – 1.0 for the current item.
    pub progress: f64,
    pub downloaded_bytes: Option<u64>,
    pub total_bytes: Option<u64>,
    /// bytes/s
    pub speed: Option<f64>,
    /// seconds
    pub eta: Option<u64>,
    pub output_dir: String,
    pub filepath: Option<String>,
    pub error: Option<JobError>,
    pub playlist_index: Option<u32>,
    pub playlist_count: Option<u32>,
    /// RFC3339
    pub created_at: String,
    pub finished_at: Option<String>,
}

// ───────────────────────────── History ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    pub id: i64,
    pub url: String,
    pub title: String,
    pub filepath: String,
    pub kind: MediaKind,
    pub preset_name: String,
    pub size: Option<u64>,
    pub thumbnail: Option<String>,
    pub extractor: Option<String>,
    /// RFC3339
    pub completed_at: String,
    /// File still exists on disk.
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryQuery {
    pub search: Option<String>,
    pub kind: Option<MediaKind>,
    pub limit: u32,
    pub offset: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPage {
    pub items: Vec<HistoryItem>,
    pub total: u64,
}

// ───────────────────────────── Auth ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserProfile {
    /// Directory / profile id passed to yt-dlp (`Default`, `Profile 1`, Firefox profile path).
    pub id: String,
    /// Human name shown in the browser itself.
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserInfo {
    pub browser: Browser,
    pub profiles: Vec<BrowserProfile>,
    /// Best-effort: the browser process is currently running (cookie DB likely locked on Windows).
    pub running: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CookieFileInfo {
    /// RFC3339 of the snapshot/import.
    pub created_at: String,
    /// "brave:Default" or "import".
    pub origin: String,
    pub cookie_count: u32,
    pub domains: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CookieTestResult {
    pub ok: bool,
    pub error: Option<JobError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteCredential {
    /// yt-dlp extractor key, e.g. "vimeo".
    pub extractor: String,
    pub username: String,
}

// ───────────────────────────── Errors ─────────────────────────────

/// Error returned by every command: a stable code the UI translates, plus raw detail.
#[derive(Debug, Clone, Serialize, Deserialize, thiserror::Error)]
#[serde(rename_all = "camelCase")]
#[error("{code:?}: {detail}")]
pub struct CommandError {
    pub code: ErrorCode,
    pub detail: String,
}

impl CommandError {
    pub fn new(code: ErrorCode, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: detail.into(),
        }
    }
    pub fn unknown(detail: impl std::fmt::Display) -> Self {
        Self::new(ErrorCode::Unknown, detail.to_string())
    }
}

impl From<anyhow::Error> for CommandError {
    fn from(e: anyhow::Error) -> Self {
        match e.downcast::<CommandError>() {
            Ok(ce) => ce,
            Err(e) => CommandError::unknown(format!("{e:#}")),
        }
    }
}

pub type CmdResult<T> = Result<T, CommandError>;

// ───────────────────────────── Event names ─────────────────────────────

pub const EVT_JOB_UPDATE: &str = "job://update";
pub const EVT_JOB_REMOVED: &str = "job://removed";
pub const EVT_DEPS_PROGRESS: &str = "deps://progress";
pub const EVT_DEPS_CHANGED: &str = "deps://changed";
