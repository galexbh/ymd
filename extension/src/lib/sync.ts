// The service worker's engine: collect → hash → send over Native Messaging → record status.
// Everything takes its dependencies as arguments so tests drive it with a fake `chrome`.

import { type BrowserName } from "./browser";
import { type ChromeApi, type MessageSender, type CookieChangeInfo } from "./chrome-api";
import { collectCookies, domainsOf, hashCookies, type WireCookie } from "./cookies";
import { cookieDomainAllowed } from "./domains";
import { applyBadge } from "./badge";
import { clickedLink, webLink } from "./links";
import { sessionsOf } from "./session";
import { mapLastError, type Status, type StatusError } from "./status";
import {
  ensureAllowlist,
  KEYS,
  readAllowlist,
  readHash,
  readStatus,
  writeHash,
  writeStatus,
} from "./storage";

export const HOST_NAME = "com.ymd.cookies";
export const PROTOCOL_VERSION = 1;
export const DEBOUNCE_MS = 3_000;
export const ALARM_NAME = "ymd-full-sync";
export const ALARM_PERIOD_MINUTES = 30;

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
export type PopupRequest = { type: "send-now" } | { type: "hello" } | { type: "open"; url: string };

/** Reply to an `open` request. */
export interface OpenResult {
  ok: boolean;
  error: StatusError | null;
}

/** Context-menu entry id. */
export const MENU_ID = "ymd-download";
const WEB_PATTERNS = ["http://*/*", "https://*/*"];

export interface PopupResponse {
  ok: boolean;
  status: Status;
}

export type NativeResult =
  { ok: true; reply: Record<string, unknown> } | { ok: false; error: StatusError };

/** One `sendNativeMessage` round trip, with `lastError` and `{ok:false}` folded into a result. */
export function sendNative(
  api: Pick<ChromeApi, "runtime">,
  message: HelloMessage | CookiesMessage | OpenMessage,
): Promise<NativeResult> {
  return new Promise((resolve) => {
    try {
      api.runtime.sendNativeMessage(HOST_NAME, message, (response) => {
        const lastError = api.runtime.lastError;
        if (lastError) return resolve({ ok: false, error: mapLastError(lastError.message) });
        if (!response || typeof response !== "object") {
          return resolve({ ok: false, error: { code: "host_failed", detail: "empty reply" } });
        }
        const reply = response as Record<string, unknown>;
        if (reply.ok !== true) {
          return resolve({
            ok: false,
            error: {
              code: "host_rejected",
              hostCode: typeof reply.code === "string" ? reply.code.slice(0, 64) : "unknown",
              detail: typeof reply.detail === "string" ? reply.detail.slice(0, 300) : undefined,
            },
          });
        }
        resolve({ ok: true, reply });
      });
    } catch (e) {
      resolve({ ok: false, error: mapLastError(e instanceof Error ? e.message : String(e)) });
    }
  });
}

export interface SyncResult {
  /** True when ymd accepted a cookies message during this call. */
  sent: boolean;
  /** True when nothing was sent because the jar matched the last accepted one. */
  skipped: boolean;
  status: Status;
}

export interface EngineDeps {
  api: ChromeApi;
  browser: () => Promise<BrowserName>;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export function createSyncEngine(deps: EngineDeps) {
  const { api, browser } = deps;
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let timer: unknown = undefined;
  // Syncs run one at a time so a debounced send and a "send now" never interleave.
  let queue: Promise<unknown> = Promise.resolve();

  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  async function runSync(force: boolean): Promise<SyncResult> {
    const allowlist = await readAllowlist(api);
    const cookies = await collectCookies(api, allowlist);
    const hash = await hashCookies(cookies);
    const previous = await readStatus(api);
    if (!force && !previous.error && hash === (await readHash(api))) {
      return { sent: false, skipped: true, status: previous };
    }
    const message: CookiesMessage = {
      type: "cookies",
      version: PROTOCOL_VERSION,
      browser: await browser(),
      cookies,
      extension: api.runtime.getManifest().version,
    };
    const result = await sendNative(api, message);
    const t = now();
    let status: Status;
    if (result.ok) {
      const replyDomains = result.reply.domains;
      status = {
        lastSyncAt: t,
        checkedAt: t,
        count: typeof result.reply.count === "number" ? result.reply.count : cookies.length,
        domains:
          Array.isArray(replyDomains) && replyDomains.every((d) => typeof d === "string")
            ? (replyDomains as string[])
            : domainsOf(cookies, allowlist),
        error: null,
        sessions: sessionsOf(cookies, allowlist),
      };
      await writeHash(api, hash);
    } else {
      status = { ...previous, error: result.error };
    }
    await writeStatus(api, status);
    return { sent: result.ok, skipped: false, status };
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

  /** Full sync. `force` ignores the hash ("Enviar ahora"). */
  function syncNow(force = false): Promise<SyncResult> {
    return serial(() => safely(() => runSync(force)));
  }

  /** Tests the bridge without sending cookies. */
  function hello(): Promise<PopupResponse> {
    return serial(async () => {
      const result = await sendNative(api, { type: "hello", version: PROTOCOL_VERSION });
      const previous = await readStatus(api);
      const status: Status = result.ok
        ? { ...previous, checkedAt: now(), error: null }
        : { ...previous, error: result.error };
      await writeStatus(api, status);
      return { ok: result.ok, status };
    });
  }

  /** Restarts the 3 s quiet period; the sync runs once changes stop arriving. */
  function schedule(): void {
    if (timer !== undefined) clearTimer(timer);
    timer = setTimer(() => {
      timer = undefined;
      void syncNow(false);
    }, DEBOUNCE_MS);
  }

  async function onCookieChanged(info: CookieChangeInfo): Promise<boolean> {
    const allowlist = await readAllowlist(api);
    if (!cookieDomainAllowed(info.cookie.domain, allowlist)) return false;
    schedule();
    return true;
  }

  /** Hands a link to ymd. A broken bridge is also recorded so the popup shows it. */
  async function open(raw: string): Promise<OpenResult> {
    const url = webLink(raw);
    if (!url) return { ok: false, error: { code: "unknown", detail: "not a web link" } };
    const result = await sendNative(api, { type: "open", version: PROTOCOL_VERSION, url });
    if (result.ok) return { ok: true, error: null };
    if (result.error.code !== "host_rejected") {
      const previous = await readStatus(api);
      await writeStatus(api, { ...previous, error: result.error }).catch(() => undefined);
    }
    return { ok: false, error: result.error };
  }

  return { syncNow, hello, schedule, onCookieChanged, open };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;

/** Creates the periodic alarm once; re-creating it on every wake would keep pushing it back. */
export async function ensureAlarm(api: Pick<ChromeApi, "alarms">): Promise<void> {
  const existing = await api.alarms.get(ALARM_NAME);
  if (!existing) api.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
}

function isPopupRequest(m: unknown): m is PopupRequest {
  if (!m || typeof m !== "object") return false;
  const r = m as { type?: unknown; url?: unknown };
  if (r.type === "send-now" || r.type === "hello") return true;
  return r.type === "open" && typeof r.url === "string";
}

/** (Re)creates the «Descargar con ymd» entry for links, media and pages on the web. */
export async function installMenu(api: Pick<ChromeApi, "contextMenus" | "i18n">): Promise<void> {
  await api.contextMenus.removeAll();
  api.contextMenus.create({
    id: MENU_ID,
    title: api.i18n.getMessage("menuDownload") || "Descargar con ymd",
    contexts: ["link", "video", "audio", "page"],
    documentUrlPatterns: WEB_PATTERNS,
    targetUrlPatterns: WEB_PATTERNS,
  });
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
      await engine.syncNow(false);
    })();
  });

  api.runtime.onStartup.addListener(() => {
    void installMenu(api).catch(() => undefined);
    void ensureAlarm(api).then(() => engine.syncNow(false));
  });

  api.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId !== MENU_ID) return;
    const url = clickedLink(info);
    if (url) void engine.open(url);
  });

  api.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) void engine.syncNow(false);
  });

  api.cookies.onChanged.addListener((info) => {
    void engine.onCookieChanged(info);
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (KEYS.allowlist in changes) engine.schedule();
    // The badge mirrors whatever status was last stored, whoever stored it.
    if (KEYS.status in changes) void readStatus(api).then((s) => applyBadge(api, s));
  });
  void readStatus(api)
    .then((s) => applyBadge(api, s))
    .catch(() => undefined);

  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!fromOwnPopup(api, sender) || !isPopupRequest(message)) return false;
    const reply =
      message.type === "open"
        ? engine.open(message.url)
        : message.type === "send-now"
          ? engine.syncNow(true).then((r): PopupResponse => ({ ok: r.sent, status: r.status }))
          : engine.hello();
    void reply.then(sendResponse);
    return true; // keeps the channel open for the async reply
  });

  void ensureAlarm(api);
}
