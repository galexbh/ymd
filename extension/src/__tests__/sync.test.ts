import { describe, expect, it } from "vitest";
import { mapLastError, stampState } from "../lib/status";
import { KEYS } from "../lib/storage";
import {
  ALARM_NAME,
  ALARM_PERIOD_MINUTES,
  createSyncEngine,
  DEBOUNCE_MS,
  HOST_NAME,
  installBackground,
  type PopupResponse,
} from "../lib/sync";
import {
  cookie,
  createChromeFake,
  flush,
  HOST_NOT_FOUND,
  type ChromeFake,
  type FakeOptions,
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
    ...options,
  });
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
    expect(Object.keys(message).sort()).toEqual(["browser", "cookies", "type", "version"]);
    expect(message).toMatchObject({ type: "cookies", version: 1, browser: "brave" });
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

  it("does not store the hash of a failed send, so the next sync retries", async () => {
    const { fake, engine } = setup({ native: { lastError: HOST_NOT_FOUND } });
    await engine.syncNow();
    expect(fake.store.has(KEYS.lastHash)).toBe(false);
    fake.setNative({ reply: { ok: true, count: 2 } });
    expect((await engine.syncNow()).sent).toBe(true);
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
    expect(timers.pending).toBe(1);
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
  it("on install seeds the defaults, creates the 30 min alarm and syncs", async () => {
    const { fake, engine } = setup();
    installBackground(engine, fake.api);
    fake.events.installed.emit({ reason: "install" });
    await flush();
    expect(fake.store.get(KEYS.allowlist)).toEqual(["youtube.com", "google.com"]);
    expect(fake.alarms.get(ALARM_NAME)?.periodInMinutes).toBe(ALARM_PERIOD_MINUTES);
    expect(cookiesSent(fake)).toHaveLength(1);
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
});
