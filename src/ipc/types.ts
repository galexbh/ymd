// IPC contract — mirror of `src-tauri/src/model.rs`. Change both in the same commit.

// ───────────── Dependencies ─────────────
export type DepId = "ytdlp" | "ffmpeg" | "deno" | "aria2c" | "atomicparsley";
export type DepLevel = "required" | "recommended" | "optional";
export type DepState = "installed" | "system" | "missing" | "installing" | "error";

export interface DepStatus {
  id: DepId;
  level: DepLevel;
  state: DepState;
  version: string | null;
  path: string | null;
  latest: string | null;
  updateAvailable: boolean;
  verified: boolean;
  canInstall: boolean;
  manualHint: string | null;
  error: string | null;
}

export type JsRuntimeName = "deno" | "node" | "bun" | "quickjs";

export interface JsRuntimeInfo {
  name: JsRuntimeName;
  path: string;
  version: string | null;
  managed: boolean;
}

export interface DepsReport {
  binDir: string;
  deps: DepStatus[];
  jsRuntime: JsRuntimeInfo | null;
  jsRuntimesFound: JsRuntimeInfo[];
}

export type DepPhase = "resolving" | "downloading" | "verifying" | "extracting" | "done" | "error";

export interface DepProgress {
  id: DepId;
  phase: DepPhase;
  received: number;
  total: number | null;
  message: string | null;
}

// ───────────── Probe ─────────────
export type ProbeKind = "video" | "playlist";

export interface FormatInfo {
  formatId: string;
  ext: string;
  height: number | null;
  fps: number | null;
  vcodec: string | null;
  acodec: string | null;
  abr: number | null;
  filesize: number | null;
  note: string | null;
}

export interface PlaylistEntry {
  /** 1-based index for --playlist-items */
  index: number;
  id: string | null;
  title: string | null;
  duration: number | null;
  thumbnail: string | null;
  url: string | null;
}

export interface ProbeResult {
  kind: ProbeKind;
  url: string;
  id: string | null;
  title: string;
  uploader: string | null;
  duration: number | null;
  thumbnail: string | null;
  extractor: string | null;
  formats: FormatInfo[];
  maxHeight: number | null;
  entries: PlaylistEntry[];
}

// ───────────── Presets & settings ─────────────
export type MediaKind = "video" | "audio";
export type VideoContainer = "mp4" | "mkv" | "webm" | "any";
export type AudioFormat = "best" | "mp3" | "m4a" | "opus" | "flac";

export interface VideoOptions {
  maxHeight: number | null;
  container: VideoContainer;
}

export interface AudioOptions {
  format: AudioFormat;
  /** "0".."10" (VBR) or bitrate like "320K" */
  quality: string;
}

export interface PostProcess {
  embedThumbnail: boolean;
  embedMetadata: boolean;
  embedSubs: boolean;
  subLangs: string;
  sponsorblockRemove: string[];
}

export interface Preset {
  id: string;
  name: string;
  kind: MediaKind;
  video: VideoOptions;
  audio: AudioOptions;
  postprocess: PostProcess;
  outputDir: string | null;
  builtin: boolean;
}

export type Language = "system" | "es" | "en";
export type ThemeMode = "system" | "light" | "dark";
export type Density = "comfortable" | "compact";
export type Radius = "sharp" | "soft" | "round";

export interface ThemeSettings {
  mode: ThemeMode;
  /** #rrggbb or null = theme default */
  accent: string | null;
  density: Density;
  radius: Radius;
  /** 0.875 – 1.25 */
  fontScale: number;
}

export type UpdateChannel = "stable" | "nightly" | "master";
export type Browser =
  "brave" | "chrome" | "chromium" | "edge" | "firefox" | "opera" | "safari" | "vivaldi" | "whale";

export type CookieSource =
  | { kind: "none" }
  | { kind: "browser"; browser: Browser; profile: string | null }
  | { kind: "file" };

export interface Settings {
  language: Language;
  theme: ThemeSettings;
  videoDir: string;
  audioDir: string;
  askEachTime: boolean;
  filenameTemplate: string;
  concurrency: number;
  binDir: string | null;
  ytdlpChannel: UpdateChannel;
  autoUpdate: boolean;
  useDownloadArchive: boolean;
  useAria2c: boolean;
  cookies: CookieSource;
  presets: Preset[];
  defaultPresetId: string;
  onboarded: boolean;
}

// ───────────── Jobs ─────────────
export type JobId = string;

export interface EnqueueRequest {
  url: string;
  presetId: string;
  /** null = single video; [] = whole playlist; else selected 1-based indexes */
  playlistItems: number[] | null;
  outputDir: string | null;
  videoPassword: string | null;
  twofactor: string | null;
  title: string | null;
  thumbnail: string | null;
}

export type JobStage =
  "queued" | "downloading" | "merging" | "postprocessing" | "done" | "error" | "canceled";

export const TERMINAL_STAGES: readonly JobStage[] = ["done", "error", "canceled"];

export type ErrorCode =
  | "bot_check"
  | "age_restricted"
  | "login_required"
  | "private"
  | "unavailable"
  | "geoblocked"
  | "ffmpeg_missing"
  | "js_runtime_missing"
  | "unsupported_url"
  | "network"
  | "cookies_locked"
  | "cookies_decrypt"
  | "disk_full"
  | "permission_denied"
  | "binary_missing"
  | "unknown";

export interface JobError {
  code: ErrorCode;
  detail: string;
}

export interface Job {
  id: JobId;
  /** accession number */
  seq: number;
  url: string;
  title: string | null;
  thumbnail: string | null;
  presetId: string;
  kind: MediaKind;
  stage: JobStage;
  /** 0..1 */
  progress: number;
  downloadedBytes: number | null;
  totalBytes: number | null;
  /** bytes/s */
  speed: number | null;
  /** seconds */
  eta: number | null;
  outputDir: string;
  filepath: string | null;
  error: JobError | null;
  playlistIndex: number | null;
  playlistCount: number | null;
  createdAt: string;
  finishedAt: string | null;
}

// ───────────── History ─────────────
export interface HistoryItem {
  id: number;
  /** accession number; null for rows archived before schema v2 */
  seq: number | null;
  /** preset id (builtins are translated by id); null before schema v2 */
  presetId: string | null;
  url: string;
  title: string;
  filepath: string;
  kind: MediaKind;
  presetName: string;
  size: number | null;
  thumbnail: string | null;
  extractor: string | null;
  completedAt: string;
  exists: boolean;
}

export interface HistoryQuery {
  search: string | null;
  kind: MediaKind | null;
  limit: number;
  offset: number;
}

export interface HistoryPage {
  items: HistoryItem[];
  total: number;
}

// ───────────── Auth ─────────────
export interface BrowserProfile {
  id: string;
  name: string;
}

export interface BrowserInfo {
  browser: Browser;
  profiles: BrowserProfile[];
  running: boolean;
}

export interface CookieFileInfo {
  createdAt: string;
  origin: string;
  cookieCount: number;
  domains: string[];
}

export interface CookieTestResult {
  ok: boolean;
  error: JobError | null;
}

export interface SiteCredential {
  extractor: string;
  username: string;
}

// ───────────── Errors & events ─────────────
/** Shape of every rejected command promise. */
export interface CommandError {
  code: ErrorCode;
  detail: string;
}

export const EVT_JOB_UPDATE = "job://update";
export const EVT_JOB_REMOVED = "job://removed";
export const EVT_DEPS_PROGRESS = "deps://progress";
export const EVT_DEPS_CHANGED = "deps://changed";
