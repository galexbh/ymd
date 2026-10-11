// The service worker's engine: collect → hash → send over Native Messaging → record status.
// Everything takes its dependencies as arguments so tests drive it with a fake `chrome`.

import { type BrowserName } from "./browser";
import { type ChromeApi, type MessageSender, type CookieChangeInfo } from "./chrome-api";
import { collectCookies, domainsOf, hashCookies, type WireCookie } from "./cookies";
import { cookieDomainAllowed, sanitizeAllowlist } from "./domains";
import { applyBadge } from "./badge";
import { clickedLink, webLink } from "./links";
import { sessionsOf } from "./session";
import { EMPTY_STATUS, mapLastError, type Status, type StatusError } from "./status";
import {
  ensureAllowlist,
  type Failure,
  KEYS,
  readAllowlist,
  readFailure,
  readHash,
  readStatus,
  SESSION_KEYS,
  writeFailure,
  writeHash,
  writeStatus,
} from "./storage";

export const HOST_NAME = "com.ymd.cookies";
export const PROTOCOL_VERSION = 1;
export const DEBOUNCE_MS = 3_000;
/** A steady trickle of changes still syncs this long after the first unsent one, at most. */
export const DEBOUNCE_MAX_WAIT_MS = 30_000;
export const ALARM_NAME = "ymd-full-sync";
export const ALARM_PERIOD_MINUTES = 30;
/**
 * How long a native message may take. ymd's host gives up on its own after 20 s; a stuck host
 * (or a browser that never calls back) must not hold the queue forever.
 */
export const NATIVE_TIMEOUT_MS = 30_000;
/** ymd's host refuses a message with more cookies than this (`MAX_COOKIES` in the host). */
export const MAX_COOKIES = 10_000;
/** Backoff after a failed send: 30 min, 1 h, 2 h… up to 6 h. */
export const RETRY_BASE_MS = ALARM_PERIOD_MINUTES * 60_000;
export const RETRY_MAX_MS = 6 * 60 * 60_000;

/**
 * Failures that cost nothing to retry: the browser answers them without starting ymd, or
 * nothing is sent at all. They wait for a changed jar or the next alarm, without backoff.
 */
const CHEAP_FAILURES: ReadonlySet<StatusError["code"]> = new Set([
  "host_not_found",
  "host_forbidden",
  "too_many_cookies",
]);

/** How long automatic syncs leave a jar alone after `attempts` failures in a row with `code`. */
export function retryDelay(code: StatusError["code"], attempts: number): number {
  if (CHEAP_FAILURES.has(code)) return 0;
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1), RETRY_MAX_MS);
}

export interface HelloMessage {
  type: "hello";
  version: typeof PROTOCOL_VERSION;
}

export interface CookiesMessage {
  type: "cookies";
  version: typeof PROTOCOL_VERSION;
  browser: BrowserName;
  cookies: WireCookie[];
  /** This extension's manifest version, so ymd can tell when the bundled one is newer. */
  extension: string;
}

/** «Descargar con ymd»: ymd opens the link in Recibir (it never downloads by itself). */
export interface OpenMessage {
  type: "open";
  version: typeof PROTOCOL_VERSION;
  url: string;
}

/** Messages the popup sends to the service worker. */
export type PopupRequest = { type: "send-now" } | { type: "hello" };

/** Result of handing a link to ymd. */
export interface OpenResult {
  ok: boolean;
  error: StatusError | null;
}

/** Context-menu entry id. */
export const MENU_ID = "ymd-download";
/** Keyboard shortcut (manifest `commands`) that sends the active tab to ymd. */
export const COMMAND_ID = "download-page";
/** Where the menu appears: everywhere a link can come from, on web pages only. */
export const MENU_CONTEXTS = ["link", "video", "audio", "frame", "selection", "page"];
const WEB_PATTERNS = ["http://*/*", "https://*/*"];

export interface PopupResponse {
  ok: boolean;
  status: Status;
}

export type NativeResult =
  | { ok: true; reply: Record<string, unknown> }
  | { ok: false; error: StatusError };

export interface TimerDeps {
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

const defaultSetTimer = (fn: () => void, ms: number): unknown => setTimeout(fn, ms);
const defaultClearTimer = (h: unknown): void => clearTimeout(h as ReturnType<typeof setTimeout>);

/**
 * One `sendNativeMessage` round trip, with `lastError` and `{ok:false}` folded into a result.
 * Without an answer after `NATIVE_TIMEOUT_MS` it resolves as a `host_failed` timeout; a reply
 * that arrives later is ignored.
 */
export function sendNative(
  api: Pick<ChromeApi, "runtime">,
  message: HelloMessage | CookiesMessage | OpenMessage,
  timers: TimerDeps & { timeoutMs?: number } = {},
): Promise<NativeResult> {
  const setTimer = timers.setTimer ?? defaultSetTimer;
  const clearTimer = timers.clearTimer ?? defaultClearTimer;
  return new Promise((resolve) => {
    let done = false;
    let handle: unknown = undefined;
    const finish = (result: NativeResult) => {
      if (done) return;
      done = true;
      if (handle !== undefined) clearTimer(handle);
      resolve(result);
    };
    handle = setTimer(
      () => finish({ ok: false, error: { code: "host_failed", detail: "timeout" } }),
      timers.timeoutMs ?? NATIVE_TIMEOUT_MS,
    );
    try {
      api.runtime.sendNativeMessage(HOST_NAME, message, (response) => {
        // Read even when late, so the browser never logs an unchecked lastError.
        const lastError = api.runtime.lastError;
        if (done) return;
        if (lastError) return finish({ ok: false, error: mapLastError(lastError.message) });
        if (!response || typeof response !== "object") {
          return finish({ ok: false, error: { code: "host_failed", detail: "empty reply" } });
        }
        const reply = response as Record<string, unknown>;
        if (reply.ok !== true) {
          return finish({
            ok: false,
            error: {
              code: "host_rejected",
              hostCode: typeof reply.code === "string" ? reply.code.slice(0, 64) : "unknown",
              detail: typeof reply.detail === "string" ? reply.detail.slice(0, 300) : undefined,
            },
          });
        }
        finish({ ok: true, reply });
      });
    } catch (e) {
      finish({ ok: false, error: mapLastError(e instanceof Error ? e.message : String(e)) });
    }
  });
}

export interface SyncResult {
  /** True when ymd accepted a cookies message during this call. */
  sent: boolean;
  /** True when nothing was sent: the jar matched the last accepted one, or it is backing off. */
  skipped: boolean;
  status: Status;
}

/**
 * Why a sync runs. `change`: cookies or the list changed (debounced). `alarm`: the periodic
 * alarm, browser startup or install, the only automatic retry of a jar that failed.
 * `force`: «Enviar ahora», which ignores the hash and the backoff.
 */
export type SyncTrigger = "change" | "alarm" | "force";
const TRIGGER_RANK: Record<SyncTrigger, number> = { change: 0, alarm: 1, force: 2 };

export interface EngineDeps extends TimerDeps {
  api: ChromeApi;
  browser: () => Promise<BrowserName>;
  now?: () => number;
}

export function createSyncEngine(deps: EngineDeps) {
  const { api, browser } = deps;
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? defaultSetTimer;
  const clearTimer = deps.clearTimer ?? defaultClearTimer;
  const timers = { setTimer, clearTimer };
  let quietTimer: unknown = undefined;
  let maxWaitTimer: unknown = undefined;
  /** The sanitized allowlist, kept in memory so a cookie change needs no storage read. */
  let allowlist: string[] | null = null;
  // Syncs run one at a time so a debounced send and a "send now" never interleave.
  let queue: Promise<unknown> = Promise.resolve();
  /** At most one sync waits behind the running one; later requests join it. */
  let queued: { trigger: SyncTrigger; promise: Promise<SyncResult> } | null = null;

  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  async function currentAllowlist(): Promise<string[]> {
    if (allowlist === null) allowlist = await readAllowlist(api);
    return allowlist;
  }

  /** Loads the list into memory (worker startup). */
  async function loadAllowlist(): Promise<void> {
    allowlist = await readAllowlist(api);
  }

  /** The stored list changed (storage.onChanged): refreshes the in-memory copy. */
  function allowlistChanged(value: unknown): void {
    allowlist = sanitizeAllowlist(value);
  }

  /**
   * Whether an automatic sync leaves a jar that already failed alone: while a costly failure
   * backs off, and past that, until the alarm comes round or the jar changes.
   */
  function waiting(failure: Failure, hash: string, trigger: SyncTrigger, t: number): boolean {
    if (!CHEAP_FAILURES.has(failure.code) && t < failure.nextAt) return true;
    return hash === failure.hash && trigger !== "alarm";
  }

  async function fail(hash: string, previous: Status, error: StatusError): Promise<SyncResult> {
    const last = await readFailure(api);
    // Failures in a row with the same cause grow the backoff, even while the jar keeps changing.
    const attempts = last && last.code === error.code ? last.attempts + 1 : 1;
    await writeFailure(api, {
      hash,
      code: error.code,
      attempts,
      nextAt: now() + retryDelay(error.code, attempts),
    });
    const status: Status = { ...previous, error };
    await writeStatus(api, status);
    return { sent: false, skipped: false, status };
  }

  async function runSync(trigger: SyncTrigger): Promise<SyncResult> {
    const list = await readAllowlist(api);
    allowlist = list;
    const cookies = await collectCookies(api, list);
    const hash = await hashCookies(cookies);
    const previous = await readStatus(api);
    if (trigger !== "force") {
      if (!previous.error && hash === (await readHash(api))) {
        return { sent: false, skipped: true, status: previous };
      }
      const failure = await readFailure(api);
      // Only while the stored error is still that failure's: a later success (a hello) or a
      // different error means something changed, so the jar is tried again.
      if (
        failure &&
        previous.error?.code === failure.code &&
        waiting(failure, hash, trigger, now())
      ) {
        return { sent: false, skipped: true, status: previous };
      }
    }
    if (cookies.length > MAX_COOKIES) {
      // ymd would refuse the whole message; say so here instead of sending it.
      return fail(hash, previous, {
        code: "too_many_cookies",
        detail: `${cookies.length} > ${MAX_COOKIES}`,
      });
    }
    const message: CookiesMessage = {
      type: "cookies",
      version: PROTOCOL_VERSION,
      browser: await browser(),
      cookies,
      extension: api.runtime.getManifest().version,
    };
    const result = await sendNative(api, message, timers);
    if (!result.ok) return fail(hash, previous, result.error);
    const t = now();
    const replyDomains = result.reply.domains;
    const status: Status = {
      lastSyncAt: t,
      checkedAt: t,
      count: typeof result.reply.count === "number" ? result.reply.count : cookies.length,
      domains:
        Array.isArray(replyDomains) && replyDomains.every((d) => typeof d === "string")
          ? (replyDomains as string[])
          : domainsOf(cookies, list),
      error: null,
      sessions: sessionsOf(cookies, list),
    };
    await writeHash(api, hash);
    await writeFailure(api, null);
    await writeStatus(api, status);
    return { sent: true, skipped: false, status };
  }

  async function safely(task: () => Promise<SyncResult>): Promise<SyncResult> {
    try {
      return await task();
    } catch (e) {
      const previous = await readStatus(api).catch(() => null);
      const status: Status = {
        lastSyncAt: previous?.lastSyncAt ?? null,
        checkedAt: previous?.checkedAt ?? null,
        count: previous?.count ?? 0,
        domains: previous?.domains ?? [],
        error: { code: "unknown", detail: e instanceof Error ? e.message.slice(0, 300) : "" },
        sessions: previous?.sessions ?? {},
      };
      await writeStatus(api, status).catch(() => undefined);
      return { sent: false, skipped: false, status };
    }
  }

  /**
   * Full sync. `true` (or "force", «Enviar ahora») ignores the hash and the backoff; `false`
   * is a change. A request made while another sync already waits joins it, and the stronger
   * trigger wins.
   */
  function syncNow(request: boolean | SyncTrigger = false): Promise<SyncResult> {
    const trigger: SyncTrigger =
      request === true ? "force" : request === false ? "change" : request;
    if (queued) {
      if (TRIGGER_RANK[trigger] > TRIGGER_RANK[queued.trigger]) queued.trigger = trigger;
      return queued.promise;
    }
    const entry: { trigger: SyncTrigger; promise: Promise<SyncResult> } = {
      trigger,
      promise: Promise.resolve({ sent: false, skipped: true, status: { ...EMPTY_STATUS } }),
    };
    queued = entry;
    entry.promise = serial(() => {
      if (queued === entry) queued = null;
      return safely(() => runSync(entry.trigger));
    });
    return entry.promise;
  }

  /** Tests the bridge without sending cookies. Always settles with a response. */
  function hello(): Promise<PopupResponse> {
    return serial(async () => {
      try {
        const result = await sendNative(api, { type: "hello", version: PROTOCOL_VERSION }, timers);
        const previous = await readStatus(api);
        const status: Status = result.ok
          ? { ...previous, checkedAt: now(), error: null }
          : { ...previous, error: result.error };
        await writeStatus(api, status);
        return { ok: result.ok, status };
      } catch (e) {
        const previous = await readStatus(api).catch(() => ({ ...EMPTY_STATUS }));
        const detail = e instanceof Error ? e.message.slice(0, 300) : "";
        return { ok: false, status: { ...previous, error: { code: "unknown", detail } } };
      }
    });
  }

  function setPending(): void {
    void api.storage.session.set({ [SESSION_KEYS.pendingSince]: now() }).catch(() => undefined);
  }

  function clearPending(): void {
    // A newer burst may have started while the sync ran; its flag has to stay.
    if (maxWaitTimer !== undefined) return;
    void api.storage.session.remove(SESSION_KEYS.pendingSince).catch(() => undefined);
  }

  function fire(): void {
    if (quietTimer !== undefined) clearTimer(quietTimer);
    if (maxWaitTimer !== undefined) clearTimer(maxWaitTimer);
    quietTimer = undefined;
    maxWaitTimer = undefined;
    void syncNow("change").then(clearPending, clearPending);
  }

  /**
   * Restarts the 3 s quiet period; the sync runs once changes stop arriving, or 30 s after the
   * first unsent change at the latest. The pending flag in `storage.session` lets a worker
   * stopped in between catch up when it wakes (`resumePending`).
   */
  function schedule(): void {
    if (quietTimer !== undefined) clearTimer(quietTimer);
    quietTimer = setTimer(fire, DEBOUNCE_MS);
    if (maxWaitTimer === undefined) {
      maxWaitTimer = setTimer(fire, DEBOUNCE_MAX_WAIT_MS);
      setPending();
    }
  }

  /** Runs the sync that a previous worker scheduled but never got to. */
  async function resumePending(): Promise<boolean> {
    const got = await api.storage.session.get(SESSION_KEYS.pendingSince);
    if (typeof got[SESSION_KEYS.pendingSince] !== "number") return false;
    if (maxWaitTimer !== undefined) return false; // this worker has one on the way already
    await syncNow("change");
    clearPending();
    return true;
  }

  async function onCookieChanged(info: CookieChangeInfo): Promise<boolean> {
    if (!cookieDomainAllowed(info.cookie.domain, await currentAllowlist())) return false;
    schedule();
    return true;
  }

  /** Hands a link to ymd. A broken bridge is also recorded so the popup shows it. */
  async function open(raw: string): Promise<OpenResult> {
    const url = webLink(raw);
    if (!url) return { ok: false, error: { code: "unknown", detail: "not a web link" } };
    const result = await sendNative(api, { type: "open", version: PROTOCOL_VERSION, url }, timers);
    if (result.ok) return { ok: true, error: null };
    if (result.error.code !== "host_rejected") {
      const previous = await readStatus(api);
      await writeStatus(api, { ...previous, error: result.error }).catch(() => undefined);
    }
    return { ok: false, error: result.error };
  }

  return {
    syncNow,
    hello,
    schedule,
    onCookieChanged,
    open,
    loadAllowlist,
    allowlistChanged,
    resumePending,
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;

/** Creates the periodic alarm once; re-creating it on every wake would keep pushing it back. */
export async function ensureAlarm(api: Pick<ChromeApi, "alarms">): Promise<void> {
  const existing = await api.alarms.get(ALARM_NAME);
  if (!existing) api.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
}

function isPopupRequest(m: unknown): m is PopupRequest {
  if (!m || typeof m !== "object") return false;
  const r = m as { type?: unknown };
  return r.type === "send-now" || r.type === "hello";
}

/**
 * (Re)creates the «Descargar con ymd» entry on web pages. There is no `targetUrlPatterns` on
 * purpose: Chrome matches it against a video's `srcUrl`, which on YouTube is a `blob:` URL, and
 * the item would vanish from the player's menu. `clickedLink` picks the right link instead.
 */
export async function installMenu(
  api: Pick<ChromeApi, "contextMenus" | "i18n" | "runtime">,
): Promise<void> {
  await api.contextMenus.removeAll();
  api.contextMenus.create(
    {
      id: MENU_ID,
      title: api.i18n.getMessage("menuDownload") || "Descargar con ymd",
      contexts: [...MENU_CONTEXTS],
      documentUrlPatterns: WEB_PATTERNS,
    },
    // Reading lastError marks a failed create (a duplicate id after a quick restart) as handled.
    () => void api.runtime.lastError,
  );
}

/**
 * Only this extension's popup may ask for a sync. `onMessage` already ignores other extensions
 * and web pages (`externally_connectable` is empty); this also rules out any other page of the
 * extension, now or in the future.
 */
export function fromOwnPopup(api: Pick<ChromeApi, "runtime">, sender: MessageSender): boolean {
  return (
    sender.id === api.runtime.id &&
    typeof sender.url === "string" &&
    sender.url.split(/[?#]/)[0] === api.runtime.getURL("popup.html")
  );
}

/** Opened once, on a fresh install. */
export const WELCOME_PAGE = "welcome.html";

/**
 * Wires every listener synchronously, as MV3 requires (listeners added after an await are lost
 * when the worker is woken by that event).
 */
export function installBackground(engine: SyncEngine, api: ChromeApi): void {
  api.runtime.onInstalled.addListener((details) => {
    void (async () => {
      await ensureAllowlist(api);
      // A fresh install opens the welcome page: pin the extension, choose the sites.
      if (details?.reason === "install") {
        await api.tabs.create({ url: api.runtime.getURL(WELCOME_PAGE) }).catch(() => undefined);
      }
      await installMenu(api).catch(() => undefined);
      await ensureAlarm(api);
      await engine.syncNow("alarm");
    })().catch(() => undefined);
  });

  api.runtime.onStartup.addListener(() => {
    void installMenu(api).catch(() => undefined);
    void ensureAlarm(api)
      .then(() => engine.syncNow("alarm"))
      .catch(() => undefined);
  });

  api.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId !== MENU_ID) return;
    const url = clickedLink(info);
    if (url) void engine.open(url);
  });

  // Alt+Shift+Y: the active tab goes to ymd. The shortcut grants `activeTab`, so its URL is
  // readable here.
  api.commands.onCommand.addListener((command) => {
    if (command !== COMMAND_ID) return;
    void api.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        const url = webLink(tab?.url);
        if (url) void engine.open(url);
      })
      .catch(() => undefined);
  });

  api.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) void engine.syncNow("alarm");
  });

  api.cookies.onChanged.addListener((info) => {
    void engine.onCookieChanged(info).catch(() => undefined);
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (KEYS.allowlist in changes) {
      engine.allowlistChanged(changes[KEYS.allowlist].newValue);
      engine.schedule();
    }
    // The badge mirrors whatever status was last stored, whoever stored it.
    if (KEYS.status in changes) {
      void readStatus(api)
        .then((s) => applyBadge(api, s))
        .catch(() => undefined);
    }
  });
  void readStatus(api)
    .then((s) => applyBadge(api, s))
    .catch(() => undefined);

  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!fromOwnPopup(api, sender) || !isPopupRequest(message)) return false;
    const reply =
      message.type === "send-now"
        ? engine.syncNow(true).then((r): PopupResponse => ({ ok: r.sent, status: r.status }))
        : engine.hello();
    void reply.then(sendResponse, (e: unknown) => {
      const detail = e instanceof Error ? e.message.slice(0, 300) : "";
      const response: PopupResponse = {
        ok: false,
        status: { ...EMPTY_STATUS, error: { code: "unknown", detail } },
      };
      sendResponse(response);
    });
    return true; // keeps the channel open for the async reply
  });

  void engine.loadAllowlist().catch(() => undefined);
  void ensureAlarm(api).catch(() => undefined);
  // A debounced sync that the previous worker never ran (it was stopped first).
  void engine.resumePending().catch(() => undefined);
}
