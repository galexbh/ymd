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

  // history
  historyQuery: (query: HistoryQuery) => invoke<HistoryPage>("history_query", { query }),
  historyDelete: (id: number) => invoke<void>("history_delete", { id }),
  historyClear: () => invoke<void>("history_clear"),

  // settings
  settingsGet: () => invoke<Settings>("settings_get"),
  settingsSet: (settings: Settings) => invoke<Settings>("settings_set", { settings }),

  // auth
  browsersDetect: () => invoke<BrowserInfo[]>("browsers_detect"),
  cookiesSnapshot: (browser: Browser, profile: string | null) =>
    invoke<CookieFileInfo>("cookies_snapshot", { browser, profile }),
  cookiesImport: (path: string) => invoke<CookieFileInfo>("cookies_import", { path }),
  cookiesInfo: () => invoke<CookieFileInfo | null>("cookies_info"),
  cookiesClear: () => invoke<void>("cookies_clear"),
  cookiesTest: (source: CookieSource) => invoke<CookieTestResult>("cookies_test", { source }),
  credentialsList: () => invoke<SiteCredential[]>("credentials_list"),
  credentialsSet: (extractor: string, username: string, password: string) =>
    invoke<SiteCredential[]>("credentials_set", { extractor, username, password }),
  credentialsDelete: (extractor: string) =>
    invoke<SiteCredential[]>("credentials_delete", { extractor }),
};

export type Api = typeof api;
