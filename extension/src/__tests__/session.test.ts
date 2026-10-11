import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { badgeFor } from "../lib/badge";
import { mountPopup } from "../lib/popup-view";
import { sessionsOf } from "../lib/session";
import { EMPTY_STATUS, type Status } from "../lib/status";
import { KEYS } from "../lib/storage";
import { createSyncEngine, installBackground } from "../lib/sync";
import {
  cookie,
  createChromeFake,
  EXTENSION_DIR,
  flush,
  HOST_NOT_FOUND,
  type FakeOptions,
} from "../test/chrome-fake";

const SIGNED_IN = [
  cookie({ name: "LOGIN_INFO", domain: ".youtube.com", value: "secret-login", httpOnly: true }),
  cookie({ name: "PREF", domain: ".youtube.com", value: "pref" }),
];
const SIGNED_OUT = [cookie({ name: "PREF", domain: ".youtube.com", value: "pref" })];

const st = (p: Partial<Status>): Status => ({ ...EMPTY_STATUS, ...p });

describe("sessionsOf", () => {
  it("tells signed in from signed out by cookie names", () => {
    expect(sessionsOf(SIGNED_IN, ["youtube.com"])).toEqual({ "youtube.com": true });
    expect(sessionsOf(SIGNED_OUT, ["youtube.com"])).toEqual({ "youtube.com": false });
    expect(
      sessionsOf([cookie({ name: "SAPISID", domain: "www.youtube.com" })], ["youtube.com"]),
    ).toEqual({ "youtube.com": true });
  });

  it("only reports ruled sites that are on the list, and ignores look-alikes", () => {
    expect(sessionsOf(SIGNED_IN, ["vimeo.com"])).toEqual({});
    expect(
      sessionsOf([cookie({ name: "LOGIN_INFO", domain: ".notyoutube.com" })], ["youtube.com"]),
    ).toEqual({ "youtube.com": false });
    // a value that looks like a session name is not a name
    expect(sessionsOf([cookie({ name: "PREF", value: "LOGIN_INFO" })], ["youtube.com"])).toEqual({
      "youtube.com": false,
    });
  });
});

describe("badge", () => {
  it("is quiet when all is well, amber when signed out, red when the bridge fails", () => {
    expect(badgeFor(st({ sessions: { "youtube.com": true } }))).toEqual({
      text: "",
      color: null,
      titleKey: null,
    });
    expect(badgeFor(st({ sessions: { "youtube.com": false } }))).toMatchObject({
      text: "!",
      titleKey: "badgeSessionClosed",
    });
    expect(
      badgeFor(st({ sessions: { "youtube.com": false }, error: { code: "host_not_found" } })),
    ).toMatchObject({ text: "!", titleKey: "badgeError" });
    // ymd refusing the jar, or a jar too big to send, also leaves cookies unsent: red, with
    // its own tooltip (a refused link never reaches the stored status)
    expect(badgeFor(st({ error: { code: "host_rejected" } }))).toMatchObject({
      text: "!",
      titleKey: "badgeRejected",
    });
    expect(badgeFor(st({ error: { code: "too_many_cookies" } }))).toMatchObject({
      text: "!",
      titleKey: "badgeTooMany",
    });
  });

  it("names a refused jar in the tooltip", async () => {
    const { fake, engine } = setup({
      cookies: SIGNED_IN,
      sites: ["youtube.com"],
      native: { reply: { ok: false, code: "io_error" } },
    });
    await engine.syncNow(true);
    await flush();
    expect(fake.record.badge).toMatchObject({
      text: "!",
      title: "ymd Cookies: ymd no pudo guardar las cookies",
    });
  });

  function setup(options: FakeOptions) {
    const fake = createChromeFake({
      native: { reply: { ok: true, count: 1, domains: [] } },
      ...options,
    });
    const engine = createSyncEngine({ api: fake.api, browser: async () => "brave", now: () => 1 });
    installBackground(engine, fake.api);
    return { fake, engine };
  }

  it("follows each stored status", async () => {
    const { fake, engine } = setup({ cookies: SIGNED_OUT, sites: ["youtube.com"] });
    await engine.syncNow(true);
    await flush();
    expect(fake.record.badge).toMatchObject({
      text: "!",
      title: "ymd Cookies: tu sesión de YouTube está cerrada",
    });
    fake.setCookie(SIGNED_IN[0]);
    await engine.syncNow(true);
    await flush();
    expect(fake.record.badge).toMatchObject({ text: "", title: "ymd Cookies" });
    fake.setNative({ lastError: HOST_NOT_FOUND });
    await engine.syncNow(true);
    await flush();
    expect(fake.record.badge).toMatchObject({
      text: "!",
      title: "ymd Cookies: no se pudo hablar con ymd",
    });
  });

  it("is restored from the stored status when the worker starts", async () => {
    const { fake } = setup({
      storage: { [KEYS.status]: st({ sessions: { "youtube.com": false } }) },
    });
    await flush();
    expect(fake.record.badge.text).toBe("!");
  });
});

describe("popup «Sesión de YouTube»", () => {
  const html = readFileSync(resolve(EXTENSION_DIR, "popup.html"), "utf8");
  const BODY = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? "";
  beforeEach(() => {
    document.body.innerHTML = BODY;
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });
  const $ = (id: string) => document.getElementById(id) as HTMLElement;

  async function mount(status: Status) {
    const fake = createChromeFake({ storage: { [KEYS.status]: status } });
    await mountPopup(document, { api: fake.api, now: () => 1 });
  }

  it("shows active or signed out, and hides when YouTube isn't on the list", async () => {
    await mount(st({ lastSyncAt: 1, sessions: { "youtube.com": true } }));
    expect($("session-fact").hidden).toBe(false);
    expect($("session-youtube").textContent).toBe("Activa");
    document.body.innerHTML = BODY;
    await mount(st({ lastSyncAt: 1, sessions: { "youtube.com": false } }));
    expect($("session-youtube").textContent).toBe("Cerrada: inicia sesión en YouTube");
    expect($("session-youtube").dataset.state).toBe("closed");
    document.body.innerHTML = BODY;
    await mount(st({ lastSyncAt: 1 }));
    expect($("session-fact").hidden).toBe(true);
  });
});
