import { describe, expect, it, vi } from "vitest";
import { type ChromeApi } from "../lib/chrome-api";
import { mapLastError, stampState } from "../lib/status";
import { KEYS, SESSION_KEYS } from "../lib/storage";
import {
  ALARM_NAME,
  ALARM_PERIOD_MINUTES,
  createSyncEngine,
  DEBOUNCE_MAX_WAIT_MS,
  DEBOUNCE_MS,
  HOST_NAME,
  installBackground,
  installMenu,
  MAX_COOKIES,
  NATIVE_TIMEOUT_MS,
  type PopupResponse,
  RETRY_BASE_MS,
  retryDelay,
  sendNative,
} from "../lib/sync";
import {
  cookie,
  createChromeFake,
  flush,
  MANIFEST_VERSION,
  HOST_NOT_FOUND,
  type ChromeFake,
  type FakeOptions,
  FAKE_ID,
  POPUP_SENDER,
} from "../test/chrome-fake";

/** A hand-cranked timer so the debounce is tested without real waiting. */
function manualTimers() {
  let nextId = 1;
  const pending = new Map<number, { fn: () => void; at: number }>();
  let clock = 0;
  return {
    setTimer: (fn: () => void, ms: number) => {
      const id = nextId++;
      pending.set(id, { fn, at: clock + ms });
      return id;
    },
    clearTimer: (id: unknown) => void pending.delete(id as number),
    advance(ms: number) {
      clock += ms;
      for (const [id, t] of [...pending]) {
        if (t.at <= clock) {
          pending.delete(id);
          t.fn();
        }
      }
    },
    get pending() {
      return pending.size;
    },
  };
}

const SEED = [
  cookie({ name: "SID", domain: ".google.com", value: "google-secret" }),
  cookie({ name: "PREF", domain: ".youtube.com", value: "youtube-secret" }),
  cookie({ name: "other", domain: ".example.com", value: "nope" }),
];

function setup(options: FakeOptions = {}) {
  const fake = createChromeFake({
    cookies: SEED,
    native: { reply: { ok: true, count: 2, domains: ["google.com", "youtube.com"] } },
    // google.com as a site the person added: on the list, with its permission granted.
    storage: { [KEYS.allowlist]: ["youtube.com", "google.com"] },
    ...options,
  });
  fake.granted.add("*://*.google.com/*");
  fake.granted.add("*://*.example.com/*"); // even when readable, it is not on the list
  const timers = manualTimers();
  let t = 1_700_000_000_000;
  const engine = createSyncEngine({
    api: fake.api,
    browser: async () => "brave",
    now: () => t,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  return {
    fake,
    timers,
    engine,
    tick: (ms: number) => (t += ms),
  };
}

function cookiesSent(fake: ChromeFake) {
  return fake.record.native.filter((n) => n.message.type === "cookies");
}

describe("cookies message", () => {
  it("has the contract shape and only allowlisted cookies", async () => {
    const { fake, engine } = setup();
    const result = await engine.syncNow();
    expect(result.sent).toBe(true);
    expect(fake.record.native).toHaveLength(1);
    const { host, message } = fake.record.native[0];
    expect(host).toBe(HOST_NAME);
    expect(Object.keys(message).sort()).toEqual([
      "browser",
      "cookies",
      "extension",
      "type",
      "version",
    ]);
    expect(message).toMatchObject({
      type: "cookies",
      version: 1,
      browser: "brave",
      extension: MANIFEST_VERSION,
    });
    expect(MANIFEST_VERSION).toMatch(/^\d+(\.\d+){0,3}$/);
    expect(message.cookies).toEqual([
      {
        domain: ".google.com",
        hostOnly: false,
        path: "/",
        secure: true,
        httpOnly: false,
        session: false,
        expirationDate: 1_900_000_000,
        name: "SID",
        value: "google-secret",
      },
      {
        domain: ".youtube.com",
        hostOnly: false,
        path: "/",
        secure: true,
        httpOnly: false,
        session: false,
        expirationDate: 1_900_000_000,
        name: "PREF",
        value: "youtube-secret",
      },
    ]);
  });
});

describe("hash", () => {
  it("skips the send when the jar did not change", async () => {
    const { fake, engine } = setup();
    expect((await engine.syncNow()).sent).toBe(true);
    const second = await engine.syncNow();
    expect(second).toMatchObject({ sent: false, skipped: true });
    expect(cookiesSent(fake)).toHaveLength(1);
  });

  it("sends again once a value changes", async () => {
    const { fake, engine } = setup();
    await engine.syncNow();
    fake.jar[1] = { ...fake.jar[1], value: "rotated" };
    expect((await engine.syncNow()).sent).toBe(true);
    expect(cookiesSent(fake)).toHaveLength(2);
  });

  it("does not store the hash of a failed send, so the next alarm retries", async () => {
    const { fake, engine } = setup({ native: { lastError: HOST_NOT_FOUND } });
    await engine.syncNow();
    expect(fake.store.has(KEYS.lastHash)).toBe(false);
    fake.setNative({ reply: { ok: true, count: 2 } });
    expect((await engine.syncNow("alarm")).sent).toBe(true);
    expect(typeof fake.store.get(KEYS.lastHash)).toBe("string");
  });

  it("send-now bypasses the hash", async () => {
    const { fake, engine } = setup();
    installBackground(engine, fake.api);
    await engine.syncNow();
    const res = (await fake.api.runtime.sendMessage({ type: "send-now" })) as PopupResponse;
    expect(res.ok).toBe(true);
    expect(cookiesSent(fake)).toHaveLength(2);
    expect(fake.record.native[1].message).toEqual(fake.record.native[0].message);
  });
});

describe("debounce", () => {
  it("coalesces a burst of allowlisted changes into one send after 3 s of quiet", async () => {
    const { fake, engine, timers } = setup();
    installBackground(engine, fake.api);
    for (let i = 0; i < 5; i++) {
      fake.setCookie(cookie({ name: "PREF", value: `v${i}` }));
      await flush(2);
      timers.advance(DEBOUNCE_MS - 1);
    }
    expect(cookiesSent(fake)).toHaveLength(0);
    timers.advance(1);
    await flush();
    expect(cookiesSent(fake)).toHaveLength(1);
    const sent = (cookiesSent(fake)[0].message.cookies as Array<{ name: string; value: string }>)
      .filter((c) => c.name === "PREF")
      .map((c) => c.value);
    expect(sent).toEqual(["v4"]);
  });

  it("ignores changes outside the allowlist", async () => {
    const { fake, engine, timers } = setup();
    installBackground(engine, fake.api);
    fake.setCookie(cookie({ name: "x", domain: ".example.com" }));
    await flush();
    expect(timers.pending).toBe(0);
    expect(await engine.onCookieChanged({ removed: true, cookie: SEED[0], cause: "x" })).toBe(true);
  });

  it("an unchanged jar after the quiet period sends nothing", async () => {
    const { fake, engine, timers } = setup();
    await engine.syncNow();
    engine.schedule();
    timers.advance(DEBOUNCE_MS);
    await flush();
    expect(cookiesSent(fake)).toHaveLength(1);
  });

  it("a changed allowlist schedules a sync", async () => {
    const { fake, engine, timers } = setup();
    installBackground(engine, fake.api);
    await fake.api.storage.local.set({ [KEYS.allowlist]: ["youtube.com"] });
    expect(timers.pending).toBe(2); // the quiet period and the 30 s ceiling
    timers.advance(DEBOUNCE_MS);
    await flush();
    const sent = cookiesSent(fake)[0].message.cookies as Array<{ name: string }>;
    expect(sent.map((c) => c.name)).toEqual(["PREF"]);
  });
});

describe("lastError mapping", () => {
  it.each([
    [HOST_NOT_FOUND, "host_not_found", "offline"],
    ["Access to the specified native messaging host is forbidden.", "host_forbidden", "error"],
    ["Native host has exited.", "host_failed", "error"],
    ["Error when communicating with the native messaging host.", "host_failed", "error"],
    ["Something else", "unknown", "error"],
  ])("%s → %s", async (message, code, stamp) => {
    expect(mapLastError(message).code).toBe(code);
    const { fake, engine } = setup({ native: { lastError: message } });
    const result = await engine.syncNow();
    expect(result.sent).toBe(false);
    expect(result.status.error?.code).toBe(code);
    expect(stampState(result.status)).toBe(stamp);
    expect(fake.api.runtime.lastError).toBeUndefined();
  });

  it("a host that answers {ok:false} is an error with its code", async () => {
    const { engine } = setup({
      native: { reply: { ok: false, code: "io_error", detail: "disk full" } },
    });
    const { status } = await engine.syncNow();
    expect(status.error).toEqual({
      code: "host_rejected",
      hostCode: "io_error",
      detail: "disk full",
    });
  });

  it("an empty reply is a host failure", async () => {
    const { engine } = setup({ native: { reply: undefined } });
    expect((await engine.syncNow()).status.error?.code).toBe("host_failed");
  });
});

describe("stored status", () => {
  it("records time, count and domains, never cookie values", async () => {
    const { fake, engine } = setup();
    await engine.syncNow();
    const status = fake.store.get(KEYS.status);
    expect(status).toEqual({
      lastSyncAt: 1_700_000_000_000,
      checkedAt: 1_700_000_000_000,
      count: 2,
      domains: ["google.com", "youtube.com"],
      error: null,
      // only a preferences cookie on YouTube: signed out (names only, values never read)
      sessions: { "youtube.com": false },
    });
    const everything = JSON.stringify([...fake.store.entries()]);
    for (const c of SEED) expect(everything).not.toContain(c.value);
  });

  it("keeps the last good sync when a later send fails", async () => {
    const { fake, engine, tick } = setup();
    await engine.syncNow();
    tick(60_000);
    fake.setNative({ lastError: HOST_NOT_FOUND });
    const { status } = await engine.syncNow(true);
    expect(status.lastSyncAt).toBe(1_700_000_000_000);
    expect(status.count).toBe(2);
    expect(status.error?.code).toBe("host_not_found");
    const everything = JSON.stringify([...fake.store.entries()]);
    for (const c of SEED) expect(everything).not.toContain(c.value);
  });
});

describe("hello", () => {
  it("tests the connection without sending cookies", async () => {
    const { fake, engine } = setup({ native: { reply: { ok: true, app: "ymd", protocol: 1 } } });
    installBackground(engine, fake.api);
    const res = (await fake.api.runtime.sendMessage({ type: "hello" })) as PopupResponse;
    expect(fake.record.native.map((n) => n.message)).toEqual([{ type: "hello", version: 1 }]);
    expect(res.ok).toBe(true);
    expect(stampState(res.status)).toBe("connected");
  });

  it("reports a missing host", async () => {
    const { engine } = setup({ native: { lastError: HOST_NOT_FOUND } });
    const res = await engine.hello();
    expect(res.ok).toBe(false);
    expect(stampState(res.status)).toBe("offline");
  });
});

describe("lifecycle", () => {
  it("on install starts an empty list, creates the 30 min alarm and syncs", async () => {
    const { fake, engine } = setup({ storage: {} });
    installBackground(engine, fake.api);
    fake.events.installed.emit({ reason: "install" });
    await flush();
    expect(fake.store.get(KEYS.allowlist)).toEqual([]);
    expect(fake.alarms.get(ALARM_NAME)?.periodInMinutes).toBe(ALARM_PERIOD_MINUTES);
    expect(cookiesSent(fake)).toHaveLength(1);
    expect(fake.record.tabsCreated).toEqual([fake.api.runtime.getURL("welcome.html")]);
  });

  it("opens the welcome page only on a fresh install, not on an update", async () => {
    const { fake, engine } = setup({ storage: { [KEYS.allowlist]: ["youtube.com"] } });
    installBackground(engine, fake.api);
    fake.events.installed.emit({ reason: "update" });
    await flush();
    expect(fake.record.tabsCreated).toEqual([]);
  });

  it("does not overwrite an edited allowlist on update", async () => {
    const { fake, engine } = setup({ storage: { [KEYS.allowlist]: ["youtube.com"] } });
    installBackground(engine, fake.api);
    fake.events.installed.emit({ reason: "update" });
    await flush();
    expect(fake.store.get(KEYS.allowlist)).toEqual(["youtube.com"]);
  });

  it("the alarm runs a full sync; other alarms are ignored", async () => {
    const { fake, engine } = setup();
    installBackground(engine, fake.api);
    fake.events.alarm.emit({ name: "unrelated", scheduledTime: 0 });
    await flush();
    expect(cookiesSent(fake)).toHaveLength(0);
    fake.events.alarm.emit({ name: ALARM_NAME, scheduledTime: 0 });
    await flush();
    expect(cookiesSent(fake)).toHaveLength(1);
  });

  it("keeps an existing alarm instead of pushing it back", async () => {
    const { fake, engine } = setup();
    fake.api.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
    const before = fake.alarms.get(ALARM_NAME);
    installBackground(engine, fake.api);
    await flush();
    expect(fake.alarms.get(ALARM_NAME)).toBe(before);
  });

  it("ignores unknown popup messages", () => {
    const { fake, engine } = setup();
    installBackground(engine, fake.api);
    const [listener] = fake.events.message.listeners;
    expect(listener({ type: "steal" }, {}, () => undefined)).toBe(false);
    expect(listener("send-now", {}, () => undefined)).toBe(false);
  });

  it("answers only its own popup, never another extension or page", () => {
    const { fake, engine } = setup();
    installBackground(engine, fake.api);
    const [listener] = fake.events.message.listeners;
    const msg = { type: "hello" };
    const no = () => undefined;
    for (const sender of [
      {},
      { id: "anotherextensionidanotherextensi", url: POPUP_SENDER.url },
      { id: FAKE_ID },
      { id: FAKE_ID, url: `chrome-extension://${FAKE_ID}/options.html` },
      { id: FAKE_ID, url: "https://example.com/popup.html" },
      { id: FAKE_ID, url: `chrome-extension://${FAKE_ID}/popup.html.evil` },
    ]) {
      expect(listener(msg, sender, no), JSON.stringify(sender)).toBe(false);
    }
    expect(fake.record.native).toHaveLength(0);
    expect(listener(msg, POPUP_SENDER, no)).toBe(true);
    expect(listener(msg, { ...POPUP_SENDER, url: `${POPUP_SENDER.url}?x=1` }, no)).toBe(true);
  });
});

describe("native timeout", () => {
  it("a host that never answers fails as a timeout after 30 s", async () => {
    const { fake, engine, timers } = setup({ native: { hang: true } });
    let settled = false;
    const run = engine.syncNow().then((r) => {
      settled = true;
      return r;
    });
    await flush();
    expect(cookiesSent(fake)).toHaveLength(1);
    timers.advance(NATIVE_TIMEOUT_MS - 1);
    await flush();
    expect(settled).toBe(false);
    timers.advance(1);
    const result = await run;
    expect(result.sent).toBe(false);
    expect(result.status.error).toEqual({ code: "host_failed", detail: "timeout" });
    expect(fake.store.has(KEYS.lastHash)).toBe(false);
  });

  it("ignores a reply that arrives after the timeout", async () => {
    const timers = manualTimers();
    let late: ((response: unknown) => void) | undefined;
    const api = {
      runtime: {
        lastError: undefined,
        sendNativeMessage: (_host: string, _msg: object, cb: (response: unknown) => void) => {
          late = cb;
        },
      },
    } as unknown as Pick<ChromeApi, "runtime">;
    const pending = sendNative(api, { type: "hello", version: 1 }, timers);
    timers.advance(NATIVE_TIMEOUT_MS);
    expect(await pending).toEqual({
      ok: false,
      error: { code: "host_failed", detail: "timeout" },
    });
    expect(() => late?.({ ok: true })).not.toThrow();
    expect(await pending).toMatchObject({ ok: false });
  });

  it("a reply in time clears the timer", async () => {
    const { engine, timers } = setup();
    await engine.syncNow();
    expect(timers.pending).toBe(0);
  });

  it("a stuck hello does not hold the queue past the timeout", async () => {
    const { fake, engine, timers } = setup({ native: { hang: true } });
    const hello = engine.hello();
    const sync = engine.syncNow(true);
    await flush();
    fake.setNative({ reply: { ok: true, count: 2 } });
    timers.advance(NATIVE_TIMEOUT_MS);
    expect((await hello).ok).toBe(false);
    expect((await sync).sent).toBe(true);
  });
});

describe("queue", () => {
  it("keeps at most one sync waiting; later requests join it", async () => {
    const { fake, engine, timers } = setup({ native: { hang: true } });
    const running = engine.syncNow();
    await flush();
    const a = engine.syncNow();
    const b = engine.syncNow();
    expect(b).toBe(a);
    timers.advance(NATIVE_TIMEOUT_MS);
    expect((await running).status.error?.detail).toBe("timeout");
    // the waiting change sync then meets a jar that just failed, and backs off
    expect(await a).toMatchObject({ sent: false, skipped: true });
    expect(cookiesSent(fake)).toHaveLength(1);
  });

  it("«Enviar ahora» upgrades the waiting sync", async () => {
    const { fake, engine, timers } = setup({ native: { hang: true } });
    const running = engine.syncNow();
    await flush();
    const waiting = engine.syncNow();
    const forced = engine.syncNow(true);
    expect(forced).toBe(waiting);
    fake.setNative({ reply: { ok: true, count: 2 } });
    timers.advance(NATIVE_TIMEOUT_MS);
    await running;
    expect((await forced).sent).toBe(true);
    expect(cookiesSent(fake)).toHaveLength(2);
  });

  it("a request made once the waiting sync started queues a new one", async () => {
    const { fake, engine } = setup();
    const first = engine.syncNow(true);
    expect(engine.syncNow(true)).toBe(first);
    await first;
    const next = engine.syncNow(true);
    expect(next).not.toBe(first);
    await next;
    expect(cookiesSent(fake)).toHaveLength(2);
  });
});

describe("retries after a failure", () => {
  const MIN = 60_000;

  it("backs off 30 min, 1 h, 2 h… capped at 6 h for costly failures", () => {
    const steps = [1, 2, 3, 4, 5, 6].map((n) => retryDelay("host_rejected", n) / MIN);
    expect(steps).toEqual([30, 60, 120, 240, 360, 360]);
    expect(RETRY_BASE_MS).toBe(ALARM_PERIOD_MINUTES * MIN);
    expect(retryDelay("host_failed", 2)).toBe(60 * MIN);
    for (const code of ["host_not_found", "host_forbidden", "too_many_cookies"] as const) {
      expect(retryDelay(code, 9)).toBe(0);
    }
  });

  it("does not resend a refused jar on every change; only the alarm retries, with backoff", async () => {
    const { fake, engine, tick } = setup({
      native: { reply: { ok: false, code: "io_error", detail: "disk full" } },
    });
    expect((await engine.syncNow()).status.error?.code).toBe("host_rejected");
    expect(await engine.syncNow()).toMatchObject({ skipped: true });
    fake.jar[1] = { ...fake.jar[1], value: "rotated" }; // even a changed jar waits
    expect(await engine.syncNow()).toMatchObject({ skipped: true });
    tick(29 * MIN);
    expect(await engine.syncNow("alarm")).toMatchObject({ skipped: true });
    expect(cookiesSent(fake)).toHaveLength(1);
    tick(MIN);
    expect(await engine.syncNow("alarm")).toMatchObject({ skipped: false, sent: false });
    expect(cookiesSent(fake)).toHaveLength(2);
    // second failure in a row: one hour
    tick(30 * MIN);
    expect(await engine.syncNow("alarm")).toMatchObject({ skipped: true });
    tick(30 * MIN);
    await engine.syncNow("alarm");
    expect(cookiesSent(fake)).toHaveLength(3);
    // «Enviar ahora» never waits
    await engine.syncNow(true);
    expect(cookiesSent(fake)).toHaveLength(4);
  });

  it("past the backoff, a changed jar is tried on the next change", async () => {
    const { fake, engine, tick } = setup({ native: { reply: { ok: false, code: "io_error" } } });
    await engine.syncNow();
    tick(30 * MIN);
    // the same jar waits for the alarm
    expect(await engine.syncNow()).toMatchObject({ skipped: true });
    fake.jar[1] = { ...fake.jar[1], value: "rotated" };
    fake.setNative({ reply: { ok: true, count: 2 } });
    expect((await engine.syncNow()).sent).toBe(true);
    expect(fake.store.get(KEYS.lastFailure)).toBeNull();
  });

  it("a missing ymd is retried by every alarm and on a changed jar, without backoff", async () => {
    const { fake, engine } = setup({ native: { lastError: HOST_NOT_FOUND } });
    await engine.syncNow();
    expect(await engine.syncNow()).toMatchObject({ skipped: true });
    await engine.syncNow("alarm");
    await engine.syncNow("alarm");
    expect(cookiesSent(fake)).toHaveLength(3);
    fake.jar[1] = { ...fake.jar[1], value: "rotated" };
    await engine.syncNow();
    expect(cookiesSent(fake)).toHaveLength(4);
  });

  it("a successful hello lifts the wait", async () => {
    const { fake, engine } = setup({ native: { reply: { ok: false, code: "io_error" } } });
    await engine.syncNow();
    fake.setNative({ reply: { ok: true, count: 2 } });
    expect((await engine.hello()).ok).toBe(true);
    expect((await engine.syncNow()).sent).toBe(true);
  });

  it("remembers only a hash, a code and two numbers", async () => {
    const { fake, engine } = setup({ native: { reply: { ok: false, code: "io_error" } } });
    await engine.syncNow();
    const failure = fake.store.get(KEYS.lastFailure) as Record<string, unknown>;
    expect(Object.keys(failure).sort()).toEqual(["attempts", "code", "hash", "nextAt"]);
    expect(failure).toMatchObject({ code: "host_rejected", attempts: 1 });
    expect(failure.hash).toMatch(/^[0-9a-f]{64}$/);
    const everything = JSON.stringify([...fake.store.entries()]);
    for (const c of SEED) expect(everything).not.toContain(c.value);
  });
});

describe("too many cookies", () => {
  function bigJar(n: number) {
    return Array.from({ length: n }, (_, i) => cookie({ name: `c${i}`, value: `v${i}` }));
  }

  it("sends nothing past ymd's limit and says why, with the red badge", async () => {
    const { fake, engine } = setup({ cookies: bigJar(MAX_COOKIES + 1) });
    installBackground(engine, fake.api);
    const result = await engine.syncNow(true);
    expect(fake.record.native).toHaveLength(0);
    expect(result.status.error).toMatchObject({ code: "too_many_cookies" });
    expect(stampState(result.status)).toBe("error");
    await flush();
    expect(fake.record.badge).toMatchObject({
      text: "!",
      title: "ymd Cookies: demasiadas cookies para enviar a ymd",
    });
  });

  it("sends exactly the limit", async () => {
    const { fake, engine } = setup({ cookies: bigJar(MAX_COOKIES) });
    expect((await engine.syncNow()).sent).toBe(true);
    expect(cookiesSent(fake)[0].message.cookies).toHaveLength(MAX_COOKIES);
  });
});

describe("allowlist cache", () => {
  it("cookie changes read the list from memory, refreshed when it changes", async () => {
    const { fake, engine } = setup();
    installBackground(engine, fake.api);
    await flush();
    const get = vi.spyOn(fake.api.storage.local, "get");
    const reads = () => get.mock.calls.filter(([k]) => k === KEYS.allowlist).length;
    for (let i = 0; i < 5; i++) fake.setCookie(cookie({ name: "PREF", value: `v${i}` }));
    await flush(2);
    expect(reads()).toBe(0);
    await fake.api.storage.local.set({ [KEYS.allowlist]: ["google.com"] });
    const youtube = { removed: false, cookie: SEED[1], cause: "explicit" };
    expect(await engine.onCookieChanged(youtube)).toBe(false);
    expect(await engine.onCookieChanged({ ...youtube, cookie: SEED[0] })).toBe(true);
    expect(reads()).toBe(0);
  });
});

describe("debounce ceiling", () => {
  it("a steady trickle of changes still syncs 30 s after the first one", async () => {
    const { fake, engine, timers } = setup();
    installBackground(engine, fake.api);
    await flush();
    const step = 2_000; // always inside the 3 s quiet period
    for (let elapsed = 0; elapsed < DEBOUNCE_MAX_WAIT_MS; elapsed += step) {
      expect(cookiesSent(fake)).toHaveLength(0);
      fake.setCookie(cookie({ name: "PREF", value: `v${elapsed}` }));
      await flush(2);
      timers.advance(step);
    }
    await flush();
    expect(cookiesSent(fake)).toHaveLength(1);
    // the next change starts a new window
    fake.setCookie(cookie({ name: "PREF", value: "after" }));
    await flush(2);
    timers.advance(DEBOUNCE_MS);
    await flush();
    expect(cookiesSent(fake)).toHaveLength(2);
  });

  it("leaves a pending flag in session storage until the sync ran", async () => {
    const { fake, engine, timers } = setup();
    engine.schedule();
    await flush(2);
    expect(typeof fake.session.get(SESSION_KEYS.pendingSince)).toBe("number");
    timers.advance(DEBOUNCE_MS);
    await flush();
    expect(cookiesSent(fake)).toHaveLength(1);
    expect(fake.session.has(SESSION_KEYS.pendingSince)).toBe(false);
  });

  it("a worker that wakes with a pending flag runs the missed sync", async () => {
    const { fake, engine } = setup({ session: { [SESSION_KEYS.pendingSince]: 1 } });
    installBackground(engine, fake.api);
    await flush();
    expect(cookiesSent(fake)).toHaveLength(1);
    expect(fake.session.has(SESSION_KEYS.pendingSince)).toBe(false);
  });

  it("without a flag, waking does not sync", async () => {
    const { fake, engine } = setup();
    installBackground(engine, fake.api);
    await flush();
    expect(cookiesSent(fake)).toHaveLength(0);
  });
});

describe("no unhandled rejections", () => {
  it("hello answers even when storage fails", async () => {
    const { fake, engine } = setup({ native: { reply: { ok: true } } });
    installBackground(engine, fake.api);
    await flush();
    vi.spyOn(fake.api.storage.local, "get").mockRejectedValue(new Error("storage gone"));
    const res = (await fake.api.runtime.sendMessage({ type: "hello" })) as PopupResponse;
    expect(res.ok).toBe(false);
    expect(res.status.error).toMatchObject({ code: "unknown", detail: "storage gone" });
  });

  it("install, startup and status changes swallow storage and alarm failures", async () => {
    const { fake, engine } = setup();
    vi.spyOn(fake.api.alarms, "get").mockRejectedValue(new Error("alarms gone"));
    installBackground(engine, fake.api);
    fake.events.installed.emit({ reason: "update" });
    fake.events.startup.emit();
    vi.spyOn(fake.api.storage.local, "get").mockRejectedValue(new Error("storage gone"));
    fake.events.storageChanged.emit({ [KEYS.status]: { newValue: null } }, "local");
    await flush();
    // Vitest fails the run on an unhandled rejection: getting here is the assertion.
    expect(cookiesSent(fake)).toHaveLength(0);
  });

  it("the menu is created with a callback that checks lastError", async () => {
    const { fake } = setup();
    const create = vi.spyOn(fake.api.contextMenus, "create");
    await installMenu(fake.api);
    expect(typeof create.mock.calls[0][1]).toBe("function");
    // a duplicate id is reported through lastError, readable inside the callback
    let seen: string | undefined;
    fake.api.contextMenus.create({ id: "ymd-download", title: "x", contexts: [] }, () => {
      seen = fake.api.runtime.lastError?.message;
    });
    await flush(1);
    expect(seen).toMatch(/duplicate/);
    expect(fake.api.runtime.lastError).toBeUndefined();
  });
});
