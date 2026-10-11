// Stateful fake of the Rust backend. Implements every command in `../commands.ts` and emits the
// events in `../events.ts`. Pure TypeScript: the transport (mockIPC + event mocking) is wired in
// `./index.ts`, so this class can also be driven directly in unit tests via `invoke()`.
import {
  EVT_DEPS_CHANGED,
  EVT_DEPS_PROGRESS,
  EVT_HIDDEN_TO_TRAY,
  EVT_JOB_REMOVED,
  EVT_JOB_UPDATE,
  EVT_QUEUE_SCHEDULE,
  TERMINAL_STAGES,
  type Browser,
  type BrowserInfo,
  type ClipboardWatch,
  type CommandError,
  type CookieFileInfo,
  type CookieSource,
  type CookieTestResult,
  type DepId,
  type DepProgress,
  type DepsReport,
  type DepStatus,
  type EnqueueRequest,
  type ErrorCode,
  type ExtensionStatus,
  type ExtensionSync,
  type HistoryItem,
  type HistoryPage,
  type HistoryQuery,
  type Job,
  type JobError,
  type JobId,
  type JsRuntimeInfo,
  type PendingJob,
  type Preset,
  type ProbeResult,
  type QueueSchedule,
  type Settings,
  type SiteCredential,
} from "../types";
import { ManualClock, RealClock, type MockClock, type TimerId } from "./clock";
import {
  BRIDGE_BROWSERS,
  DEFAULT_FILENAME_TEMPLATE,
  EXTENSION_ID,
  DEP_CATALOG,
  DEP_ORDER,
  browsersFixture,
  bridgeTargetsFixture,
  builtinPresets,
  defaultSettings,
  extensionDirFor,
  BUNDLED_EXTENSION_VERSION,
  hash,
  hostManifestFor,
  isPlaylistUrl,
  joinPath,
  platformPaths,
  probePlaylist,
  probeVideo,
  rng,
  safeFileName,
  seedHistory,
  thumbnail,
  videoIdFor,
  type MockPlatform,
  type PlatformPaths,
} from "./fixtures";

/** Dependency situations the UI must handle. */
export type DepsScenario =
  /** Nothing installed, no JS runtime anywhere, not onboarded, empty history. */
  | "first-run"
  /** yt-dlp + ffmpeg managed and current; Node.js detected on the system; optionals missing. */
  | "ready"
  /** Like `ready`, but the managed yt-dlp is old and an update is available. */
  | "outdated"
  /** Everything installed, including Node.js (managed), aria2c and AtomicParsley. */
  | "complete"
  /** Like `ready`, but yt-dlp is only an old copy found on PATH (system), with an update out. */
  | "system-outdated";

export interface MockDelays {
  /** Latency added to every command (ms of simulated time). */
  command: number;
  /** Extra time `probe` takes. */
  probe: number;
  /** Extra time cookie snapshot/test take. */
  auth: number;
}

export interface MockBackendOptions {
  scenario?: DepsScenario;
  /** "real" (default) uses timers; "manual" only moves when you call `clock.advance()`. */
  clock?: "real" | "manual";
  /** Real clock speed factor (2 = everything twice as fast). Default 1. */
  speed?: number;
  /** Simulated start time (epoch ms or ISO string). Manual clock default: 2026-10-08T15:00Z. */
  startTime?: number | string;
  platform?: MockPlatform;
  /** Seed ~25 history rows. Default: true, except in the `first-run` scenario. */
  seedHistory?: boolean;
  /** Brave is open (cookie DB locked). Default true. */
  braveRunning?: boolean;
  /** false = Firefox listed as not installed (the owner's real Windows setup) */
  firefoxInstalled?: boolean;
  /** Dependencies whose install fails at the verification step (checksum mismatch). */
  failDeps?: DepId[];
  /** Simulated latencies. Default all 0 (tests); the dev boot uses realistic values. */
  delays?: Partial<MockDelays>;
  /** Overrides merged into the default settings (then sanitized). */
  settings?: Partial<Settings>;
  /** Seed for speed jitter. */
  seed?: number;
  /** Text on the simulated system clipboard (`plugin:clipboard-manager|read_text`). */
  clipboard?: string | null;
  /** A link sent from the browser before start-up (cold start: `ymd --open-url`). */
  pendingUrl?: string | null;
  /** Cookie bridge state. */
  extension?: MockExtensionOptions;
}

/** State of the cookie bridge (ymd Cookies extension ↔ native host). */
export interface MockExtensionOptions {
  /** ymd registered its native-messaging host with the browsers. Default true. */
  registered?: boolean;
  /** The build bundles the extension folder (false = dev build). Default true. */
  extensionDir?: boolean;
  /**
   * Version of the bundled extension. Default `BUNDLED_EXTENSION_VERSION` ("1.4.1"), or null
   * without the folder (like the real build).
   */
  bundledVersion?: string | null;
  /** Last sync delivered by the extension. Default null (installed, nothing synced yet). */
  lastSync?: ExtensionSync | null;
  /** The user's default browser. Default "brave". */
  defaultBrowser?: Browser | null;
  /** Display name of the default browser (forks: "Opera GX", "Arc"…). Default from defaultBrowser. */
  defaultBrowserName?: string | null;
  /** Default browser is Chromium-based. Default: true unless Firefox/Safari/none. */
  defaultBrowserChromium?: boolean;
}

const BROWSER_LABELS: Record<Browser, string> = {
  brave: "Brave",
  chrome: "Chrome",
  chromium: "Chromium",
  edge: "Edge",
  firefox: "Firefox",
  opera: "Opera",
  safari: "Safari",
  vivaldi: "Vivaldi",
  whale: "Whale",
};

function defaultBrowserFields(o: MockExtensionOptions): {
  defaultBrowser: Browser | null;
  defaultBrowserName: string | null;
  defaultBrowserChromium: boolean;
} {
  const browser = o.defaultBrowser === undefined ? "brave" : o.defaultBrowser;
  const name = o.defaultBrowserName ?? (browser ? BROWSER_LABELS[browser] : null);
  const chromium =
    o.defaultBrowserChromium ?? (browser !== null && browser !== "firefox" && browser !== "safari");
  return { defaultBrowser: browser, defaultBrowserName: name, defaultBrowserChromium: chromium };
}

export type MockEmitter = (event: string, payload: unknown) => void;

export interface MockCall {
  cmd: string;
  args: Record<string, unknown> | undefined;
}

export interface MockEvent {
  event: string;
  payload: unknown;
}

/** URL substrings that make a download (not the probe) fail, checked in order. */
export const FAILURE_RULES: { match: string; code: ErrorCode; detail: string }[] = [
  {
    match: "bot",
    code: "bot_check",
    detail:
      "ERROR: [youtube] Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for the authentication.",
  },
  {
    match: "private",
    code: "private",
    detail: "ERROR: [youtube] Private video. Sign in if you've been granted access to this video",
  },
  {
    match: "age",
    code: "age_restricted",
    detail:
      "ERROR: [youtube] Sign in to confirm your age. This video may be inappropriate for some users.",
  },
  {
    match: "geo",
    code: "geoblocked",
    detail: "ERROR: [generic] The uploader has not made this video available in your country",
  },
  {
    match: "nofmt",
    code: "ffmpeg_missing",
    detail: "ERROR: You have requested merging of multiple formats but ffmpeg is not installed",
  },
];

/** URL substrings that make `probe` itself reject. */
export const PROBE_FAILURE_RULES: { match: string; code: ErrorCode; detail: string }[] = [
  {
    match: "notfound",
    code: "unavailable",
    detail: "ERROR: [youtube] Video unavailable. This video has been removed by the uploader",
  },
  {
    match: "offline",
    code: "network",
    detail: "ERROR: Unable to download webpage: <urlopen error [Errno 11001] getaddrinfo failed>",
  },
];

const TICK_MS = 250; // ~4 Hz, like the real throttle
const POST_STAGE_MS = 1200;
const ACTIVE: Job["stage"][] = ["downloading", "merging", "postprocessing"];

interface SimJob {
  job: Job;
  req: EnqueueRequest;
  preset: Preset;
  timer: TimerId | null;
  items: { title: string; id: string; total: number }[];
  itemIdx: number;
  itemBytes: number;
  baseSpeed: number;
  failure: JobError | null;
  rand: () => number;
}

export function commandError(code: ErrorCode, detail: string): CommandError {
  return { code, detail };
}

function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

function isTerminal(stage: Job["stage"]): boolean {
  return TERMINAL_STAGES.includes(stage);
}

const HEX = /^#[0-9a-f]{6}$/i;
const CLIPBOARD_WATCH: readonly ClipboardWatch[] = ["off", "known", "any"];

/** Finished jobs kept in the session list (mirrors `jobs::MAX_FINISHED_JOBS`); older ones
 * are evicted with `job://removed`. */
export const MAX_FINISHED_JOBS = 200;

/** Mirrors `settings::sanitize` (concurrency 1..=8, fontScale clamp, accent hex, presets). */
export function sanitizeSettings(input: Settings, fallback: Settings): Settings {
  const s = clone(input);
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  s.concurrency = Math.min(8, Math.max(1, Math.round(num(s.concurrency, fallback.concurrency))));
  s.theme = { ...fallback.theme, ...s.theme };
  s.theme.fontScale = Math.min(1.25, Math.max(0.875, num(s.theme.fontScale, 1)));
  s.theme.accent =
    typeof s.theme.accent === "string" && HEX.test(s.theme.accent.trim())
      ? s.theme.accent.trim().toLowerCase()
      : null;
  if (!s.filenameTemplate || !s.filenameTemplate.trim()) {
    s.filenameTemplate = DEFAULT_FILENAME_TEMPLATE;
  }
  if (!s.videoDir || !s.videoDir.trim()) s.videoDir = fallback.videoDir;
  if (!s.audioDir || !s.audioDir.trim()) s.audioDir = fallback.audioDir;
  if (s.binDir !== null && !String(s.binDir).trim()) s.binDir = null;
  const seen = new Set<string>();
  s.presets = (Array.isArray(s.presets) ? s.presets : []).filter((p) => {
    if (!p || !p.id || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  // `#[serde(default)]` on the audio tidy-up flags: older presets load them as off.
  for (const p of s.presets) {
    if (!p.postprocess) continue;
    p.postprocess.splitArtistTitle = p.postprocess.splitArtistTitle === true;
    p.postprocess.squareCover = p.postprocess.squareCover === true;
    p.postprocess.normalizeVolume = p.postprocess.normalizeVolume === true;
  }
  if (s.presets.length === 0) s.presets = builtinPresets();
  if (!s.presets.some((p) => p.id === s.defaultPresetId)) s.defaultPresetId = s.presets[0].id;
  if (!CLIPBOARD_WATCH.includes(s.clipboardWatch)) s.clipboardWatch = fallback.clipboardWatch;
  if (typeof s.closeToTray !== "boolean") s.closeToTray = true;
  if (typeof s.trayHintShown !== "boolean") s.trayHintShown = false;
  const rate = s.limitRateMbps;
  s.limitRateMbps =
    typeof rate === "number" && Number.isInteger(rate) && rate >= 1 && rate <= 1000 ? rate : null;
  if (typeof s.notifyDownloads !== "boolean") s.notifyDownloads = true;
  return s;
}

/** Bytes per second of `limitRateMbps` (yt-dlp's `M` suffix is a mebibyte). */
const MIB = 1024 * 1024;

export class MockBackend {
  readonly clock: MockClock;
  readonly platform: MockPlatform;
  readonly paths: PlatformPaths;
  /** Every command received, in order (plugin commands included). */
  readonly calls: MockCall[] = [];
  /** Last 500 events emitted. */
  readonly events: MockEvent[] = [];

  private emitter: MockEmitter;
  /** link sent from the browser, waiting for `take_pending_url` */
  private pendingUrl: string | null = null;
  private readonly delays: MockDelays;
  private readonly failDeps: Set<DepId>;
  private settings: Settings;
  private readonly settingsFallback: Settings;
  private deps = new Map<DepId, DepStatus>();
  private jsRuntimesFound: JsRuntimeInfo[] = [];
  private jsRuntime: JsRuntimeInfo | null = null;
  private installing = new Set<DepId>();
  private jobs = new Map<JobId, SimJob>();
  /** downloads a "previous session" left unfinished (`simulateRestart`), by id */
  private pending = new Map<JobId, PendingJob>();
  private seq = 0;
  /** scheduled queue start (simulated epoch ms), like `JobManager::start_at`; in memory only */
  private startAt: number | null = null;
  private scheduleTimer: TimerId | null = null;
  private history: HistoryItem[] = [];
  private nextHistoryId = 1;
  private cookies: CookieFileInfo | null = null;
  private credentials = new Map<string, { username: string; password: string }>();
  private braveRunning: boolean;
  private firefoxInstalled: boolean;
  private probeCache = new Map<string, ProbeResult>();
  private extension: ExtensionStatus;
  private seed: number;
  private clipboard: string | null;
  /** the next «Exportar diagnóstico» save dialog is closed without picking a file */
  private saveDialogCancels = false;
  private disposed = false;

  constructor(options: MockBackendOptions = {}, emitter: MockEmitter = () => {}) {
    const start =
      typeof options.startTime === "string" ? Date.parse(options.startTime) : options.startTime;
    this.clock =
      options.clock === "manual"
        ? new ManualClock(start)
        : new RealClock(options.speed ?? 1, start);
    this.emitter = emitter;
    this.platform = options.platform ?? "windows";
    this.paths = platformPaths(this.platform);
    this.delays = { command: 0, probe: 0, auth: 0, ...options.delays };
    this.failDeps = new Set(options.failDeps ?? []);
    this.braveRunning = options.braveRunning ?? true;
    this.firefoxInstalled = options.firefoxInstalled ?? true;
    this.seed = options.seed ?? 7;
    this.clipboard = options.clipboard ?? null;
    this.pendingUrl = options.pendingUrl ?? null;
    const ext = options.extension ?? {};
    const bundled = ext.extensionDir ?? true;
    this.extension = {
      extensionId: EXTENSION_ID,
      extensionDir: bundled ? extensionDirFor(this.platform) : null,
      bundledVersion:
        ext.bundledVersion !== undefined
          ? ext.bundledVersion
          : bundled
            ? BUNDLED_EXTENSION_VERSION
            : null,
      hostManifest: hostManifestFor(this.platform),
      targets: bridgeTargetsFixture(ext.registered ?? true),
      lastSync: clone(ext.lastSync ?? null),
      ...defaultBrowserFields(ext),
    };
    this.settingsFallback = defaultSettings(this.platform);
    this.settings = sanitizeSettings(
      { ...this.settingsFallback, ...options.settings } as Settings,
      this.settingsFallback,
    );
    const scenario = options.scenario ?? "ready";
    this.applyScenario(scenario);
    if (scenario === "first-run" && options.settings?.onboarded === undefined) {
      this.settings.onboarded = false;
    }
    if (options.seedHistory ?? scenario !== "first-run") {
      this.history = seedHistory(this.clock.now(), this.platform);
      this.nextHistoryId = this.history.length + 1;
      // accession numbers continue from the archive, like the real backend
      this.seq = Math.max(0, ...this.history.map((h) => h.seq ?? 0));
    }
  }

  // ───────────── Test / dev controls ─────────────

  get manualClock(): ManualClock {
    if (!(this.clock instanceof ManualClock)) {
      throw new Error("MockBackend was created with a real clock; pass { clock: 'manual' }");
    }
    return this.clock;
  }

  setEmitter(emitter: MockEmitter): void {
    this.emitter = emitter;
  }

  /** Reset dependency state to a scenario (emits `deps://changed`). */
  setScenario(scenario: DepsScenario): void {
    this.applyScenario(scenario);
    this.emit(EVT_DEPS_CHANGED, this.report(false));
  }

  setBrowserRunning(browser: Browser, running: boolean): void {
    if (browser === "brave") this.braveRunning = running;
  }

  /** Make the next diagnostics save dialogs cancel (true) or pick a file (false). */
  setSaveDialogCancels(cancel: boolean): void {
    this.saveDialogCancels = cancel;
  }

  /** Put text on the simulated system clipboard (null = empty, reading fails like the OS). */
  setClipboard(text: string | null): void {
    this.clipboard = text;
  }

  /**
   * «Descargar con ymd» from the browser: the link waits for the UI, and a running app is told
   * (like the single-instance callback). Before the UI listens it is just picked up on start.
   */
  simulateOpenUrl(url: string): void {
    this.pendingUrl = url;
    this.emit("app://open-url", null);
  }

  /**
   * The window's X (like the Rust `tray::on_window_event`): with «closeToTray» the window hides;
   * the first time the flag is stored and `app://hidden-to-tray` is emitted. Returns whether
   * the window was hidden (false = ymd would quit).
   */
  simulateWindowClose(): boolean {
    if (!this.settings.closeToTray) return false;
    if (!this.settings.trayHintShown) {
      this.settings.trayHintShown = true;
      this.emit(EVT_HIDDEN_TO_TRAY, null);
    }
    return true;
  }

  /**
   * ymd quit and started again (like `JobManager::shutdown` + the next launch): queued and
   * running jobs become pending rows (secrets dropped, only flagged), and the session's list
   * empties (`job://removed` for each, so a running UI starts clean). Returns the new rows.
   */
  simulateRestart(): PendingJob[] {
    const given = (v: string | null | undefined) => typeof v === "string" && v.length > 0;
    const added: PendingJob[] = [];
    const sims = [...this.jobs.values()].sort((a, b) => a.job.seq - b.job.seq);
    for (const sim of sims) {
      this.stopTimer(sim);
      const j = sim.job;
      if (!isTerminal(j.stage)) {
        const row: PendingJob = {
          id: j.id,
          seq: j.seq,
          url: j.url,
          presetId: j.presetId,
          playlistItems: sim.req.playlistItems ? [...sim.req.playlistItems] : null,
          outputDir: j.outputDir,
          title: j.title,
          thumbnail: j.thumbnail,
          kind: j.kind,
          createdAt: j.createdAt,
          needsSecret: given(sim.req.videoPassword) || given(sim.req.twofactor),
        };
        this.pending.set(row.id, row);
        added.push(clone(row));
      }
      this.jobs.delete(j.id);
      this.emit(EVT_JOB_REMOVED, j.id);
    }
    return added;
  }

  /**
   * The extension delivered `count` cookies from `browser` (writes cookies.txt + meta).
   * `extensionVersion` is the sender's manifest version (default: the bundled one; null = no
   * valid version stored).
   */
  simulateExtensionSync(
    browser: string,
    count: number,
    domains: string[],
    signedIn: string[] = domains.some((d) => /youtube\.com$/.test(d)) ? ["youtube.com"] : [],
    extensionVersion: string | null = BUNDLED_EXTENSION_VERSION,
  ): ExtensionSync {
    const at = new Date(this.clock.now()).toISOString();
    const sync: ExtensionSync = {
      at,
      browser,
      cookieCount: count,
      domains: [...domains],
      signedIn: [...signedIn],
      extensionVersion,
    };
    this.extension.lastSync = sync;
    // a message got through, so the host is registered for that browser
    for (const t of this.extension.targets) {
      if (t.browser === browser) t.registered = true;
    }
    this.cookies = {
      createdAt: at,
      origin: `extension:${browser}`,
      cookieCount: count,
      domains: [...domains],
      signedIn: [...signedIn],
    };
    return clone(sync);
  }

  /** Change the bridge registration / bundled folder / last sync. */
  setExtensionState(state: MockExtensionOptions): void {
    if (state.registered !== undefined) {
      for (const t of this.extension.targets) t.registered = state.registered;
    }
    if (state.extensionDir !== undefined) {
      this.extension.extensionDir = state.extensionDir ? extensionDirFor(this.platform) : null;
      this.extension.bundledVersion = state.extensionDir ? BUNDLED_EXTENSION_VERSION : null;
    }
    if (state.bundledVersion !== undefined) this.extension.bundledVersion = state.bundledVersion;
    if (state.lastSync !== undefined) this.extension.lastSync = clone(state.lastSync);
    if (
      state.defaultBrowser !== undefined ||
      state.defaultBrowserName !== undefined ||
      state.defaultBrowserChromium !== undefined
    ) {
      Object.assign(this.extension, defaultBrowserFields(state));
    }
  }

  setDepFails(id: DepId, fails: boolean): void {
    if (fails) this.failDeps.add(id);
    else this.failDeps.delete(id);
  }

  /** Snapshot of the internal state (deep copies). */
  snapshot() {
    return {
      settings: clone(this.settings),
      deps: this.report(false),
      jobs: [...this.jobs.values()].map((j) => clone(j.job)),
      queueStartAt: this.scheduleString(),
      history: clone(this.history),
      cookies: clone(this.cookies),
      credentials: this.credentialList(),
      extension: clone(this.extension),
      pending: [...this.pending.values()].map((p) => clone(p)),
    };
  }

  dispose(): void {
    this.disposed = true;
    for (const sim of this.jobs.values()) this.stopTimer(sim);
    this.clearScheduleTimer();
    this.clock.dispose();
  }

  // ───────────── Transport entry point ─────────────

  /** Handle one IPC call. Rejections carry a `CommandError`, like the real backend. */
  async invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ cmd, args: clone(args) });
    if (this.delays.command > 0 && !cmd.startsWith("plugin:")) {
      await this.wait(this.delays.command);
    }
    return this.dispatch(cmd, args ?? {});
  }

  private dispatch(cmd: string, a: Record<string, unknown>): unknown {
    switch (cmd) {
      // deps
      case "deps_report":
        return this.report(Boolean(a.checkLatest));
      case "deps_install":
        return this.installDep(a.id as DepId);
      case "deps_remove":
        return this.removeDep(a.id as DepId);
      case "deps_install_recommended":
        return this.installRecommended();
      // jobs
      case "probe":
        return this.probe(String(a.url ?? ""));
      case "enqueue":
        return this.enqueue(a.req as EnqueueRequest);
      case "jobs_list":
        return [...this.jobs.values()]
          .sort((x, y) => x.job.seq - y.job.seq)
          .map((s) => clone(s.job));
      case "job_cancel":
        return this.cancel(a.id as JobId);
      case "job_retry":
        return this.retry(a.id as JobId);
      case "job_remove":
        return this.remove(a.id as JobId);
      case "jobs_clear_finished":
        return this.clearFinished();
      case "jobs_next_seq":
        return this.seq + 1;
      case "queue_schedule":
        return this.setSchedule((a.at as string | null | undefined) ?? null);
      case "queue_schedule_get":
        return this.scheduleString();
      case "jobs_pending":
        return [...this.pending.values()].sort((x, y) => x.seq - y.seq).map((p) => clone(p));
      case "jobs_resume":
        return this.resume((a.ids as JobId[] | undefined) ?? []);
      case "jobs_discard_pending":
        for (const id of (a.ids as JobId[] | undefined) ?? []) this.pending.delete(id);
        return null;
      // history
      case "history_query":
        return this.historyQuery(a.query as HistoryQuery);
      case "history_delete":
        this.history = this.history.filter((h) => h.id !== a.id);
        return null;
      case "history_clear":
        this.history = [];
        return null;
      // settings
      case "settings_get":
        return clone(this.settings);
      case "settings_set":
        return this.setSettings(a.settings as Settings);
      case "take_pending_url": {
        const url = this.pendingUrl;
        this.pendingUrl = null;
        return url;
      }
      // auth
      case "browsers_detect":
        return clone(browsersFixture(this.braveRunning, this.firefoxInstalled)) as BrowserInfo[];
      case "cookies_info":
        return clone(this.cookies);
      case "cookies_clear":
        this.cookies = null;
        return null;
      case "cookies_test":
        return this.cookiesTest(a.source as CookieSource);
      case "credentials_list":
        return this.credentialList();
      case "credentials_set":
        return this.credentialSet(
          String(a.extractor ?? ""),
          String(a.username ?? ""),
          String(a.password ?? ""),
        );
      case "credentials_delete":
        this.credentials.delete(String(a.extractor ?? "").trim());
        return this.credentialList();
      // cookie bridge
      case "extension_status":
        return clone(this.extension);
      case "extension_open_page":
        return this.extensionOpenPage((a.browser as Browser | null | undefined) ?? null);
      // diagnostics
      case "app_data_dir":
        return this.paths.dataDir;
      case "diagnostics_export":
        return this.diagnosticsExport();
      default:
        if (cmd.startsWith("plugin:")) return this.plugin(cmd, a);
        throw commandError("unknown", `mock backend: unhandled command "${cmd}"`);
    }
  }

  // ───────────── Dependencies ─────────────

  private applyScenario(scenario: DepsScenario): void {
    this.deps.clear();
    for (const id of DEP_ORDER) this.deps.set(id, this.depStatus(id, "missing", null));
    this.jsRuntimesFound = [];
    this.jsRuntime = null;
    const node: JsRuntimeInfo = {
      name: "node",
      path:
        this.platform === "windows" ? "C:\\Program Files\\nodejs\\node.exe" : "/usr/local/bin/node",
      version: "22.11.0",
      managed: false,
    };
    if (scenario === "first-run") return;
    this.deps.set("ytdlp", this.depStatus("ytdlp", "installed", DEP_CATALOG.ytdlp.latest));
    this.deps.set("ffmpeg", this.depStatus("ffmpeg", "installed", DEP_CATALOG.ffmpeg.latest));
    if (scenario === "system-outdated") {
      const sys = this.depStatus("ytdlp", "system", "2026.03.17");
      sys.path = this.platform === "windows" ? "C:\\yt-dlp\\yt-dlp.exe" : "/usr/local/bin/yt-dlp";
      sys.latest = DEP_CATALOG.ytdlp.latest;
      sys.updateAvailable = true;
      this.deps.set("ytdlp", sys);
    }
    if (scenario === "outdated") {
      const old = this.depStatus("ytdlp", "installed", "2025.12.08");
      old.latest = DEP_CATALOG.ytdlp.latest;
      old.updateAvailable = true;
      this.deps.set("ytdlp", old);
    }
    if (scenario === "complete") {
      for (const id of ["node", "aria2c", "atomicparsley"] as DepId[]) {
        this.deps.set(id, this.depStatus(id, "installed", DEP_CATALOG[id].latest));
      }
      this.setNodeRuntime(true);
    } else {
      this.jsRuntimesFound = [node];
      this.jsRuntime = node;
      this.deps.set("node", this.systemNodeStatus() ?? this.depStatus("node", "missing", null));
    }
  }

  private binDir(): string {
    return this.settings.binDir ?? this.paths.binDir;
  }

  private depCanInstall(id: DepId): boolean {
    return !(id === "aria2c" && this.platform !== "windows");
  }

  private depStatus(id: DepId, state: DepStatus["state"], version: string | null): DepStatus {
    const c = DEP_CATALOG[id];
    const installed = state === "installed";
    const canInstall = this.depCanInstall(id);
    return {
      id,
      level: c.level,
      state,
      version,
      path: installed ? joinPath(this.paths.sep, this.binDir(), c.file + this.paths.exe) : null,
      latest: null,
      updateAvailable: false,
      verified: installed && c.verified,
      canInstall,
      manualHint: canInstall
        ? null
        : this.platform === "macos"
          ? "brew install aria2"
          : "sudo apt install aria2",
      error: null,
    };
  }

  /** The `node` dependency as found on PATH (state `system`), when a system Node exists. */
  private systemNodeStatus(): DepStatus | null {
    const sys = this.jsRuntimesFound.find((r) => r.name === "node" && !r.managed);
    if (!sys) return null;
    return { ...this.depStatus("node", "system", sys.version), path: sys.path };
  }

  private setNodeRuntime(present: boolean): void {
    this.jsRuntimesFound = this.jsRuntimesFound.filter((r) => !(r.name === "node" && r.managed));
    if (present) {
      const node: JsRuntimeInfo = {
        name: "node",
        path: joinPath(this.paths.sep, this.binDir(), "node" + this.paths.exe),
        version: DEP_CATALOG.node.latest.replace(/^v/, ""),
        managed: true,
      };
      this.jsRuntimesFound.unshift(node);
    }
    // Managed copies win over system ones.
    this.jsRuntime = this.jsRuntimesFound[0] ?? null;
  }

  private report(checkLatest: boolean): DepsReport {
    if (checkLatest) {
      for (const d of this.deps.values()) {
        d.latest = DEP_CATALOG[d.id].latest;
        d.updateAvailable =
          (d.state === "installed" || d.state === "system") && d.version !== d.latest;
      }
    }
    return clone({
      binDir: this.binDir(),
      deps: DEP_ORDER.map((id) => this.deps.get(id)!),
      jsRuntime: this.jsRuntime,
      jsRuntimesFound: this.jsRuntimesFound,
    });
  }

  private activeJobs(): number {
    let n = 0;
    for (const s of this.jobs.values()) if (ACTIVE.includes(s.job.stage)) n++;
    return n;
  }

  private installDep(id: DepId): Promise<DepsReport> {
    const c = DEP_CATALOG[id];
    if (!c) return Promise.reject(commandError("unknown", `unknown dependency "${String(id)}"`));
    if (this.installing.has(id)) {
      return Promise.reject(commandError("unknown", `${id} is already being installed`));
    }
    if (id === "ytdlp" && this.activeJobs() > 0) {
      return Promise.reject(
        commandError("unknown", "yt-dlp cannot be replaced while downloads are running"),
      );
    }
    const prev = this.deps.get(id)!;
    if (!prev.canInstall) {
      return Promise.reject(
        commandError("unknown", prev.manualHint ?? `${id} cannot be installed`),
      );
    }
    this.installing.add(id);
    this.deps.set(id, { ...prev, state: "installing", error: null });

    const progress = (p: Omit<DepProgress, "id">) => this.emit(EVT_DEPS_PROGRESS, { id, ...p });
    const fails = this.failDeps.has(id);
    const STEPS = 12;
    const STEP_MS = 100;

    return new Promise<DepsReport>((resolve, reject) => {
      const at = (ms: number, fn: () => void) =>
        this.clock.setTimeout(() => {
          if (!this.disposed) fn();
        }, ms);
      progress({ phase: "resolving", received: 0, total: null, message: null });
      for (let i = 1; i <= STEPS; i++) {
        at(i * STEP_MS, () =>
          progress({
            phase: "downloading",
            received: Math.round((c.size * i) / STEPS),
            total: c.size,
            message: null,
          }),
        );
      }
      const tVerify = STEPS * STEP_MS + 100;
      at(tVerify, () => {
        if (fails) {
          const detail = `SHA-256 mismatch for ${c.file}: download discarded, existing copy untouched`;
          this.installing.delete(id);
          this.deps.set(
            id,
            prev.state === "installed"
              ? { ...prev, error: detail }
              : { ...prev, state: "error", error: detail },
          );
          progress({ phase: "error", received: c.size, total: c.size, message: detail });
          this.emit(EVT_DEPS_CHANGED, this.report(false));
          reject(commandError("unknown", detail));
          return;
        }
        progress({
          phase: "verifying",
          received: c.size,
          total: c.size,
          message: c.verified
            ? null
            : "No checksum published; downloaded over HTTPS from the official host",
        });
      });
      if (fails) return;
      const tExtract = tVerify + 300;
      if (c.archive) {
        at(tExtract, () =>
          progress({ phase: "extracting", received: c.size, total: c.size, message: null }),
        );
      }
      at(2000, () => {
        this.installing.delete(id);
        const next = this.depStatus(id, "installed", c.latest);
        next.latest = c.latest;
        this.deps.set(id, next);
        if (id === "node") this.setNodeRuntime(true);
        progress({ phase: "done", received: c.size, total: c.size, message: null });
        const report = this.report(false);
        this.emit(EVT_DEPS_CHANGED, report);
        resolve(report);
      });
    });
  }

  private removeDep(id: DepId): DepsReport {
    if (!DEP_CATALOG[id]) throw commandError("unknown", `unknown dependency "${String(id)}"`);
    if (this.installing.has(id)) throw commandError("unknown", `${id} is being installed`);
    if (id === "ytdlp" && this.activeJobs() > 0) {
      throw commandError("unknown", "yt-dlp cannot be removed while downloads are running");
    }
    this.deps.set(id, this.depStatus(id, "missing", null));
    if (id === "node") {
      this.setNodeRuntime(false);
      // Like the real backend: a Node.js on PATH shows up again as the system copy.
      const sys = this.systemNodeStatus();
      if (sys) this.deps.set(id, sys);
    }
    const report = this.report(false);
    this.emit(EVT_DEPS_CHANGED, report);
    return report;
  }

  private async installRecommended(): Promise<DepsReport> {
    const wanted = DEP_ORDER.filter((id) => {
      const d = this.deps.get(id)!;
      const want =
        d.level === "required" || (d.level === "recommended" && (id !== "node" || !this.jsRuntime));
      const absent =
        d.state === "missing" ||
        d.state === "error" ||
        (id === "node" && d.state === "system" && !this.jsRuntime);
      return want && absent && d.canInstall;
    });
    for (const id of wanted) await this.installDep(id);
    return this.report(false);
  }

  // ───────────── Probe & jobs ─────────────

  private async probe(url: string): Promise<ProbeResult> {
    const u = url.trim();
    if (this.delays.probe > 0) await this.wait(this.delays.probe);
    if (!/^https?:\/\/\S+\.\S+/i.test(u)) {
      throw commandError("unsupported_url", `ERROR: '${u}' is not a valid URL`);
    }
    const lower = u.toLowerCase();
    for (const r of PROBE_FAILURE_RULES) {
      if (lower.includes(r.match)) throw commandError(r.code, r.detail);
    }
    if (!this.ytdlpUsable()) {
      throw commandError("binary_missing", "yt-dlp is not installed");
    }
    const result = isPlaylistUrl(u) ? probePlaylist(u) : probeVideo(u);
    this.probeCache.set(u, result);
    return clone(result);
  }

  private ytdlpUsable(): boolean {
    const s = this.deps.get("ytdlp")!.state;
    return s === "installed" || s === "system";
  }

  private findPreset(id: string): Preset {
    const p = this.settings.presets.find((x) => x.id === id);
    if (!p) throw commandError("unknown", `unknown preset "${id}"`);
    return p;
  }

  /** Like `JobManager::resume`: same id and number; secret-needing rows are skipped. */
  private resume(ids: JobId[]): Job[] {
    const out: Job[] = [];
    const rows = ids
      .map((id) => this.pending.get(id))
      .filter((p): p is PendingJob => p !== undefined && !p.needsSecret && !this.jobs.has(p.id))
      .sort((x, y) => x.seq - y.seq);
    for (const p of rows) {
      this.pending.delete(p.id);
      out.push(
        this.enqueue(
          {
            url: p.url,
            presetId: p.presetId,
            playlistItems: p.playlistItems,
            outputDir: p.outputDir,
            videoPassword: null,
            twofactor: null,
            title: p.title,
            thumbnail: p.thumbnail,
          },
          p,
        ),
      );
    }
    return out;
  }

  private enqueue(req: EnqueueRequest, resumed?: PendingJob): Job {
    if (!req || typeof req.url !== "string" || !req.url.trim()) {
      throw commandError("unsupported_url", "empty URL");
    }
    const preset = this.findPreset(req.presetId);
    if (!this.ytdlpUsable()) {
      throw commandError("binary_missing", "yt-dlp is not installed");
    }
    const url = req.url.trim();
    const probed =
      this.probeCache.get(url) ?? (isPlaylistUrl(url) ? probePlaylist(url) : probeVideo(url));
    const outputDir =
      req.outputDir ??
      preset.outputDir ??
      (preset.kind === "audio" ? this.settings.audioDir : this.settings.videoDir);

    let items: SimJob["items"];
    if (probed.kind === "playlist") {
      const entries =
        req.playlistItems && req.playlistItems.length > 0
          ? probed.entries.filter((e) => req.playlistItems!.includes(e.index))
          : probed.entries;
      items = entries.map((e) => ({
        title: e.title ?? `Entry ${e.index}`,
        id: e.id ?? videoIdFor(`${url}#${e.index}`),
        total: this.sizeFor(`${url}#${e.index}`, preset),
      }));
    } else {
      items = [
        { title: probed.title, id: probed.id ?? videoIdFor(url), total: this.sizeFor(url, preset) },
      ];
    }

    const now = new Date(this.clock.now()).toISOString();
    const id =
      resumed?.id ?? `job-${hash(`${url}|${this.seq}|${now}`).toString(16)}-${this.seq + 1}`;
    const seq = resumed ? resumed.seq : this.seq + 1;
    this.seq = Math.max(this.seq, seq);
    const job: Job = {
      id,
      seq,
      url,
      title: req.title ?? probed.title,
      thumbnail: req.thumbnail ?? probed.thumbnail ?? thumbnail(url, preset.kind),
      presetId: preset.id,
      kind: preset.kind,
      stage: "queued",
      progress: 0,
      downloadedBytes: null,
      totalBytes: null,
      speed: null,
      eta: null,
      outputDir,
      filepath: null,
      error: null,
      playlistIndex: probed.kind === "playlist" ? 1 : null,
      playlistCount: probed.kind === "playlist" ? items.length : null,
      createdAt: resumed?.createdAt ?? now,
      finishedAt: null,
    };
    const lower = url.toLowerCase();
    const rule = FAILURE_RULES.find((r) => lower.includes(r.match));
    const rand = rng(hash(url) ^ this.seed ^ this.seq);
    const sim: SimJob = {
      job,
      req: clone(req),
      preset,
      timer: null,
      items,
      itemIdx: 0,
      itemBytes: 0,
      baseSpeed: 3_500_000 + rand() * 6_500_000,
      failure: rule ? { code: rule.code, detail: rule.detail } : null,
      rand,
    };
    this.jobs.set(id, sim);
    this.emitJob(sim);
    const queued = clone(sim.job);
    this.pump();
    return queued;
  }

  private sizeFor(seed: string, preset: Preset): number {
    const r = rng(hash(seed))();
    if (preset.kind === "audio") return Math.round(3_000_000 + r * 9_000_000);
    const h = preset.video.maxHeight ?? 1080;
    const scale = h >= 1080 ? 1 : h >= 720 ? 0.55 : 0.3;
    return Math.round((25_000_000 + r * 70_000_000) * scale);
  }

  /** Start queued jobs while there are free slots (settings.concurrency). */
  private pump(): void {
    if (this.startAt !== null && this.clock.now() < this.startAt) return;
    let free = this.settings.concurrency - this.activeJobs();
    const queued = [...this.jobs.values()]
      .filter((s) => s.job.stage === "queued")
      .sort((a, b) => a.job.seq - b.job.seq);
    for (const sim of queued) {
      if (free <= 0) break;
      free--;
      this.start(sim);
    }
  }

  private start(sim: SimJob): void {
    const j = sim.job;
    j.stage = "downloading";
    sim.itemIdx = 0;
    sim.itemBytes = 0;
    j.totalBytes = sim.items[0]?.total ?? null;
    j.downloadedBytes = 0;
    j.progress = 0;
    this.emitJob(sim);
    this.schedule(sim, TICK_MS, () => this.tick(sim));
  }

  private schedule(sim: SimJob, ms: number, fn: () => void): void {
    this.stopTimer(sim);
    sim.timer = this.clock.setTimeout(() => {
      sim.timer = null;
      if (!this.disposed) fn();
    }, ms);
  }

  private stopTimer(sim: SimJob): void {
    if (sim.timer !== null) {
      this.clock.clearTimeout(sim.timer);
      sim.timer = null;
    }
  }

  private tick(sim: SimJob): void {
    const j = sim.job;
    if (j.stage !== "downloading") return;
    if (sim.failure) {
      this.finish(sim, "error", sim.failure);
      return;
    }
    const item = sim.items[sim.itemIdx];
    const cap = this.settings.limitRateMbps;
    const raw = sim.baseSpeed * (0.7 + sim.rand() * 0.6);
    // the real cap applies when the job starts; a live one keeps the simulation simple
    const speed = cap === null ? raw : Math.min(raw, cap * MIB);
    sim.itemBytes = Math.min(item.total, sim.itemBytes + speed * (TICK_MS / 1000));
    const count = sim.items.length;
    j.speed = Math.round(speed);
    j.downloadedBytes = Math.round(sim.itemBytes);
    j.totalBytes = item.total;
    j.eta = Math.max(0, Math.round((item.total - sim.itemBytes) / speed));
    j.progress = Math.min(1, (sim.itemIdx + sim.itemBytes / item.total) / count);
    if (j.playlistCount !== null) j.playlistIndex = sim.itemIdx + 1;

    if (sim.itemBytes >= item.total) {
      if (sim.itemIdx + 1 < count) {
        sim.itemIdx++;
        sim.itemBytes = 0;
        this.emitJob(sim);
        this.schedule(sim, TICK_MS, () => this.tick(sim));
        return;
      }
      j.stage = sim.preset.kind === "audio" ? "postprocessing" : "merging";
      j.progress = 1;
      j.speed = null;
      j.eta = null;
      this.emitJob(sim);
      this.schedule(sim, POST_STAGE_MS, () => this.finish(sim, "done", null));
      return;
    }
    this.emitJob(sim);
    this.schedule(sim, TICK_MS, () => this.tick(sim));
  }

  private extFor(preset: Preset): string {
    if (preset.kind === "audio")
      return preset.audio.format === "best" ? "opus" : preset.audio.format;
    return preset.video.container === "any" ? "mkv" : preset.video.container;
  }

  private finish(sim: SimJob, stage: "done" | "error" | "canceled", error: JobError | null): void {
    this.stopTimer(sim);
    const j = sim.job;
    const now = new Date(this.clock.now()).toISOString();
    j.stage = stage;
    j.error = error;
    j.speed = null;
    j.eta = null;
    j.finishedAt = now;
    if (stage === "done") {
      j.progress = 1;
      const ext = this.extFor(sim.preset);
      const files = sim.items.map((it) =>
        joinPath(this.paths.sep, j.outputDir, `${safeFileName(it.title)} [${it.id}].${ext}`),
      );
      j.filepath = files[files.length - 1] ?? null;
      sim.items.forEach((it, i) => {
        this.history.unshift({
          id: this.nextHistoryId++,
          seq: j.seq,
          presetId: sim.preset.id,
          url: sim.items.length > 1 ? `https://www.youtube.com/watch?v=${it.id}` : j.url,
          title: it.title,
          filepath: files[i],
          kind: j.kind,
          presetName: sim.preset.name,
          size: it.total,
          thumbnail: sim.items.length > 1 ? thumbnail(it.id, j.kind) : j.thumbnail,
          extractor: j.url.includes("youtu") ? "youtube" : "generic",
          completedAt: now,
          exists: true,
        });
      });
    }
    this.emitJob(sim);
    this.evictFinished();
    this.pump();
  }

  /** Like `JobManager`: keep only the newest MAX_FINISHED_JOBS finished rows in memory. */
  private evictFinished(): void {
    const finished = [...this.jobs.values()]
      .filter((s) => isTerminal(s.job.stage))
      .sort((a, b) => b.job.seq - a.job.seq);
    for (const sim of finished.slice(MAX_FINISHED_JOBS)) {
      this.jobs.delete(sim.job.id);
      this.emit(EVT_JOB_REMOVED, sim.job.id);
    }
  }

  private getJob(id: JobId): SimJob {
    const sim = this.jobs.get(id);
    if (!sim) throw commandError("unknown", `no such job: ${id}`);
    return sim;
  }

  private cancel(id: JobId): null {
    const sim = this.getJob(id);
    if (!isTerminal(sim.job.stage)) this.finish(sim, "canceled", null);
    return null;
  }

  private retry(id: JobId): Job {
    const sim = this.getJob(id);
    if (sim.job.stage !== "error" && sim.job.stage !== "canceled") {
      throw commandError("unknown", "only failed or canceled jobs can be retried");
    }
    Object.assign(sim.job, {
      stage: "queued",
      progress: 0,
      downloadedBytes: null,
      totalBytes: null,
      speed: null,
      eta: null,
      filepath: null,
      error: null,
      finishedAt: null,
      playlistIndex: sim.job.playlistCount !== null ? 1 : null,
    } satisfies Partial<Job>);
    this.emitJob(sim);
    const queued = clone(sim.job);
    this.pump();
    return queued;
  }

  private remove(id: JobId): null {
    const sim = this.getJob(id);
    if (!isTerminal(sim.job.stage)) {
      throw commandError("unknown", "cancel the job before removing it");
    }
    this.jobs.delete(id);
    this.emit(EVT_JOB_REMOVED, id);
    return null;
  }

  private clearFinished(): JobId[] {
    const ids: JobId[] = [];
    for (const [id, sim] of this.jobs) {
      if (isTerminal(sim.job.stage)) ids.push(id);
    }
    for (const id of ids) {
      this.jobs.delete(id);
      this.emit(EVT_JOB_REMOVED, id);
    }
    return ids;
  }

  private emitJob(sim: SimJob): void {
    this.emit(EVT_JOB_UPDATE, clone(sim.job));
  }

  // ───────────── Scheduled start (mirrors `JobManager::set_start_at`) ─────────────

  private scheduleString(): string | null {
    // RFC 3339 in UTC with whole seconds, like `SecondsFormat::Secs`
    return this.startAt === null
      ? null
      : new Date(this.startAt).toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  private clearScheduleTimer(): void {
    if (this.scheduleTimer !== null) {
      this.clock.clearTimeout(this.scheduleTimer);
      this.scheduleTimer = null;
    }
  }

  private setSchedule(at: string | null): string | null {
    let when: number | null = null;
    if (at !== null && at.trim()) {
      when = Date.parse(at);
      if (Number.isNaN(when)) throw commandError("unknown", `invalid time "${at}"`);
      when = Math.floor(when / 1000) * 1000;
    }
    // an instant that already passed means «start now»
    if (when !== null && when <= this.clock.now()) when = null;
    this.clearScheduleTimer();
    this.startAt = when;
    this.emit(EVT_QUEUE_SCHEDULE, { startAt: this.scheduleString() } satisfies QueueSchedule);
    if (when === null) {
      this.pump();
    } else {
      this.scheduleTimer = this.clock.setTimeout(() => {
        this.scheduleTimer = null;
        if (this.disposed) return;
        this.startAt = null;
        this.emit(EVT_QUEUE_SCHEDULE, { startAt: null } satisfies QueueSchedule);
        this.pump();
      }, when - this.clock.now());
    }
    return this.scheduleString();
  }

  // ───────────── History ─────────────

  private historyQuery(q: Partial<HistoryQuery> | undefined): HistoryPage {
    const search = (q?.search ?? "").trim().toLowerCase();
    const kind = q?.kind ?? null;
    const limit = Math.max(0, q?.limit ?? 50);
    const offset = Math.max(0, q?.offset ?? 0);
    const rows = this.history
      .filter((h) => !kind || h.kind === kind)
      .filter(
        (h) =>
          !search ||
          (/^\d+$/.test(search) && h.seq === Number(search)) ||
          h.title.toLowerCase().includes(search) ||
          h.url.toLowerCase().includes(search) ||
          h.filepath.toLowerCase().includes(search),
      )
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt) || b.id - a.id);
    return { items: clone(rows.slice(offset, offset + limit)), total: rows.length };
  }

  // ───────────── Settings ─────────────

  private setSettings(next: Settings): Settings {
    if (!next || typeof next !== "object") throw commandError("unknown", "invalid settings");
    const before = this.settings.concurrency;
    const hintShown = this.settings.trayHintShown;
    this.settings = sanitizeSettings(next, this.settingsFallback);
    // like `settings::keep_backend_fields`: a stale UI copy never unsets the tray notice
    this.settings.trayHintShown ||= hintShown;
    if (this.settings.concurrency > before) this.pump();
    return clone(this.settings);
  }

  // ───────────── Auth ─────────────

  private profileName(browser: Browser, profile: string | null): string | null {
    const info = browsersFixture(this.braveRunning, this.firefoxInstalled).find(
      (b) => b.browser === browser,
    );
    if (!info) return null;
    if (profile === null) return info.profiles[0]?.name ?? "Default";
    const p = info.profiles.find((x) => x.id === profile || x.name === profile);
    return p ? p.name : null;
  }

  private lockedError(): CommandError {
    return commandError(
      "cookies_locked",
      "ERROR: Could not copy Chrome cookie database. See https://github.com/yt-dlp/yt-dlp/issues/7271 for more info",
    );
  }

  /** Real behaviour on Windows: Chromium browsers use app-bound encryption yt-dlp cannot undo. */
  private decryptError(browser: Browser): CommandError | null {
    if (this.platform !== "windows" || browser === "firefox") return null;
    return commandError(
      "cookies_decrypt",
      "ERROR: Failed to decrypt with DPAPI. See  https://github.com/yt-dlp/yt-dlp/issues/10927  for more info",
    );
  }

  private async cookiesTest(source: CookieSource): Promise<CookieTestResult> {
    if (this.delays.auth > 0) await this.wait(this.delays.auth);
    if (!source || source.kind === "none") return { ok: true, error: null };
    if (source.kind === "extension") {
      return this.cookies
        ? { ok: true, error: null }
        : { ok: false, error: { code: "unknown", detail: "The extension has not synced yet" } };
    }
    if (this.profileName(source.browser, source.profile) === null) {
      return {
        ok: false,
        error: { code: "unknown", detail: `browser profile not found: ${source.browser}` },
      };
    }
    if (source.browser === "brave" && this.braveRunning) {
      return { ok: false, error: this.lockedError() };
    }
    const decrypt = this.decryptError(source.browser);
    if (decrypt) return { ok: false, error: decrypt };
    return { ok: true, error: null };
  }

  private credentialList(): SiteCredential[] {
    return [...this.credentials.entries()]
      .map(([extractor, v]) => ({ extractor, username: v.username }))
      .sort((a, b) => a.extractor.localeCompare(b.extractor));
  }

  private credentialSet(extractor: string, username: string, password: string): SiteCredential[] {
    const e = extractor.trim();
    const u = username.trim();
    if (!e || !u || !password) {
      throw commandError("unknown", "extractor, username and password are required");
    }
    this.credentials.set(e, { username: u, password });
    return this.credentialList();
  }

  private extensionOpenPage(browser: Browser | null): null {
    // null = launch the default browser by its own executable (Chromium forks such as Arc).
    if (browser === null) {
      if (!this.extension.defaultBrowserName) {
        throw commandError("binary_missing", "could not find the default browser executable");
      }
      return null;
    }
    const target = this.extension.targets.find((t) => t.browser === browser);
    if (!target || !BRIDGE_BROWSERS.includes(browser)) {
      throw commandError("unknown", `extensions page not supported for ${String(browser)}`);
    }
    if (!target.installed) throw commandError("unknown", `${browser} is not installed`);
    return null;
  }

  // ───────────── Diagnostics ─────────────

  /** Path of the zip the real backend would save (`ymd-diagnostico-YYYYMMDD-HHMM.zip`), or
   * null when the save dialog is cancelled. Nothing is written. */
  private diagnosticsExport(): string | null {
    if (this.saveDialogCancels) return null;
    const d = new Date(this.clock.now());
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    return joinPath(this.paths.sep, this.paths.downloads, `ymd-diagnostico-${stamp}.zip`);
  }

  // ───────────── Tauri plugins used by the app ─────────────

  private plugin(cmd: string, a: Record<string, unknown>): unknown {
    switch (cmd) {
      case "plugin:dialog|open": {
        const opts = (a.options ?? {}) as { directory?: boolean; multiple?: boolean };
        const pick = opts.directory
          ? joinPath(this.paths.sep, this.paths.home, "Downloads", "ymd")
          : joinPath(this.paths.sep, this.paths.downloads, "cookies.txt");
        return opts.multiple ? [pick] : pick;
      }
      case "plugin:dialog|save":
        return joinPath(this.paths.sep, this.paths.downloads, "export.txt");
      case "plugin:dialog|message":
      case "plugin:dialog|ask":
      case "plugin:dialog|confirm":
        return true;
      case "plugin:notification|is_permission_granted":
        return true;
      case "plugin:notification|request_permission":
        return "granted";
      case "plugin:os|locale":
        return "es-HN";
      case "plugin:os|hostname":
        return "ana-desktop";
      case "plugin:app|version":
        return "0.2.0";
      case "plugin:app|name":
        return "ymd";
      case "plugin:app|tauri_version":
        return "2.11.0";
      case "plugin:clipboard-manager|read_text":
        // the real plugin rejects when the clipboard holds no text
        if (this.clipboard === null) throw "The clipboard contents were not available";
        return this.clipboard;
      default:
        // opener, notification|notify, window/webview calls, ...: succeed silently.
        return null;
    }
  }

  // ───────────── Plumbing ─────────────

  private emit(event: string, payload: unknown): void {
    this.events.push({ event, payload });
    if (this.events.length > 500) this.events.splice(0, this.events.length - 500);
    this.emitter(event, payload);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.clock.setTimeout(resolve, ms));
  }
}
