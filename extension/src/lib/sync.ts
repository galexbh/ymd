// The service worker's engine: collect → hash → send over Native Messaging → record status.
// Everything takes its dependencies as arguments so tests drive it with a fake `chrome`.

import { type BrowserName } from "./browser";
import { type ChromeApi, type CookieChangeInfo } from "./chrome-api";
import { collectCookies, domainsOf, hashCookies, type WireCookie } from "./cookies";
import { cookieDomainAllowed } from "./domains";
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
}

/** Messages the popup sends to the service worker. */
export type PopupRequest = { type: "send-now" } | { type: "hello" };

export interface PopupResponse {
  ok: boolean;
  status: Status;
}

export type NativeResult =
  { ok: true; reply: Record<string, unknown> } | { ok: false; error: StatusError };

/** One `sendNativeMessage` round trip, with `lastError` and `{ok:false}` folded into a result. */
export function sendNative(
  api: Pick<ChromeApi, "runtime">,
  message: HelloMessage | CookiesMessage,
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

  return { syncNow, hello, schedule, onCookieChanged };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;

/** Creates the periodic alarm once; re-creating it on every wake would keep pushing it back. */
export async function ensureAlarm(api: Pick<ChromeApi, "alarms">): Promise<void> {
  const existing = await api.alarms.get(ALARM_NAME);
  if (!existing) api.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
}

function isPopupRequest(m: unknown): m is PopupRequest {
  return (
    !!m &&
    typeof m === "object" &&
    ((m as PopupRequest).type === "send-now" || (m as PopupRequest).type === "hello")
  );
}

/**
 * Wires every listener synchronously, as MV3 requires (listeners added after an await are lost
 * when the worker is woken by that event).
 */
export function installBackground(engine: SyncEngine, api: ChromeApi): void {
  api.runtime.onInstalled.addListener(() => {
    void (async () => {
      await ensureAllowlist(api);
      await ensureAlarm(api);
      await engine.syncNow(false);
    })();
  });

  api.runtime.onStartup.addListener(() => {
    void ensureAlarm(api).then(() => engine.syncNow(false));
  });

  api.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) void engine.syncNow(false);
  });

  api.cookies.onChanged.addListener((info) => {
    void engine.onCookieChanged(info);
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && KEYS.allowlist in changes) engine.schedule();
  });

  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isPopupRequest(message)) return false;
    const reply =
      message.type === "send-now"
        ? engine.syncNow(true).then((r): PopupResponse => ({ ok: r.sent, status: r.status }))
        : engine.hello();
    void reply.then(sendResponse);
    return true; // keeps the channel open for the async reply
  });

  void ensureAlarm(api);
}
