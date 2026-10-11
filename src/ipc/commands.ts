// Typed wrappers for every Tauri command. The only place `invoke` is called.
import { invoke } from "@tauri-apps/api/core";
import type {
  Browser,
  BrowserInfo,
  CommandError,
  CookieFileInfo,
  CookieSource,
  CookieTestResult,
  DepId,
  DepsReport,
  ExtensionStatus,
  EnqueueRequest,
  HistoryPage,
  HistoryQuery,
  Job,
  JobId,
  ProbeResult,
  Settings,
  SiteCredential,
} from "./types";

export function isCommandError(e: unknown): e is CommandError {
  return typeof e === "object" && e !== null && "code" in e && "detail" in e;
}

/** Normalizes any rejection into a CommandError. */
export function toCommandError(e: unknown): CommandError {
  if (isCommandError(e)) return e;
  return { code: "unknown", detail: e instanceof Error ? e.message : String(e) };
}

export const api = {
  // deps
  depsReport: (checkLatest = false) => invoke<DepsReport>("deps_report", { checkLatest }),
  depsInstall: (id: DepId) => invoke<DepsReport>("deps_install", { id }),
  depsRemove: (id: DepId) => invoke<DepsReport>("deps_remove", { id }),
  depsInstallRecommended: () => invoke<DepsReport>("deps_install_recommended"),

  // jobs
  probe: (url: string) => invoke<ProbeResult>("probe", { url }),
  enqueue: (req: EnqueueRequest) => invoke<Job>("enqueue", { req }),
  jobsList: () => invoke<Job[]>("jobs_list"),
  jobCancel: (id: JobId) => invoke<void>("job_cancel", { id }),
  jobRetry: (id: JobId) => invoke<Job>("job_retry", { id }),
  jobRemove: (id: JobId) => invoke<void>("job_remove", { id }),
  jobsClearFinished: () => invoke<JobId[]>("jobs_clear_finished"),
  jobsNextSeq: () => invoke<number>("jobs_next_seq"),
  /** hold queued jobs until `at` (RFC 3339); null clears it and starts them now */
  queueSchedule: (at: string | null) => invoke<string | null>("queue_schedule", { at }),
  queueScheduleGet: () => invoke<string | null>("queue_schedule_get"),

  // history
  historyQuery: (query: HistoryQuery) => invoke<HistoryPage>("history_query", { query }),
  historyDelete: (id: number) => invoke<void>("history_delete", { id }),
  historyClear: () => invoke<void>("history_clear"),

  // settings
  settingsGet: () => invoke<Settings>("settings_get"),
  settingsSet: (settings: Settings) => invoke<Settings>("settings_set", { settings }),
  /** The link sent from the browser («Descargar con ymd»), handed over once. */
  takePendingUrl: () => invoke<string | null>("take_pending_url"),

  // auth
  browsersDetect: () => invoke<BrowserInfo[]>("browsers_detect"),
  cookiesInfo: () => invoke<CookieFileInfo | null>("cookies_info"),
  cookiesClear: () => invoke<void>("cookies_clear"),
  cookiesTest: (source: CookieSource) => invoke<CookieTestResult>("cookies_test", { source }),
  credentialsList: () => invoke<SiteCredential[]>("credentials_list"),
  credentialsSet: (extractor: string, username: string, password: string) =>
    invoke<SiteCredential[]>("credentials_set", { extractor, username, password }),
  credentialsDelete: (extractor: string) =>
    invoke<SiteCredential[]>("credentials_delete", { extractor }),

  // cookie bridge (ymd Cookies extension)
  extensionStatus: () => invoke<ExtensionStatus>("extension_status"),
  /** launches (or focuses) a browser; null = the default browser by its own executable */
  extensionOpenPage: (browser: Browser | null) => invoke<void>("extension_open_page", { browser }),

  // diagnostics (local only: nothing is uploaded)
  /** ymd's data folder (history, logs, cookie copy), as the backend resolves it */
  appDataDir: () => invoke<string>("app_data_dir"),
  /** «Exportar diagnóstico»: saved zip path, or null when the save dialog was cancelled */
  diagnosticsExport: () => invoke<string | null>("diagnostics_export"),
};

export type Api = typeof api;
