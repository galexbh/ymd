import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clickedLink, webLink } from "../lib/links";
import { mountPopup } from "../lib/popup-view";
import { KEYS } from "../lib/storage";
import { createSyncEngine, installBackground, MENU_ID, type OpenResult } from "../lib/sync";
import {
  createChromeFake,
  EXTENSION_DIR,
  flush,
  HOST_NOT_FOUND,
  POPUP_SENDER,
  type FakeOptions,
} from "../test/chrome-fake";

const YT = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

function setup(options: FakeOptions = {}) {
  const fake = createChromeFake({ native: { reply: { ok: true } }, ...options });
  const engine = createSyncEngine({ api: fake.api, browser: async () => "brave", now: () => 1 });
  installBackground(engine, fake.api);
  return { fake, engine };
}

const opens = (fake: ReturnType<typeof createChromeFake>) =>
  fake.record.native.filter((m) => m.message.type === "open").map((m) => m.message);

describe("webLink / clickedLink", () => {
  it("keeps plain web links and refuses everything else", () => {
    expect(webLink(` ${YT} `)).toBe(YT);
    expect(webLink("http://vimeo.com:8080/1")).toBe("http://vimeo.com:8080/1");
    for (const bad of [
      undefined,
      "",
      "blob:https://www.youtube.com/abc",
      "chrome://extensions",
      "file:///C:/x",
      "javascript:alert(1)",
      "https://u:p@a.com/",
      "https://localhost/",
      "https://10.0.0.1/",
      "https://a.com/x y",
      `https://a.com/${"x".repeat(2048)}`,
    ]) {
      expect(webLink(bad), String(bad)).toBeNull();
    }
  });

  it("prefers the link, then the media, then the page", () => {
    expect(
      clickedLink({ linkUrl: "https://a.com/l", srcUrl: "https://a.com/s", pageUrl: YT }),
    ).toBe("https://a.com/l");
    // YouTube's <video> is a blob: URL, so the page is used
    expect(clickedLink({ srcUrl: "blob:https://www.youtube.com/x", pageUrl: YT })).toBe(YT);
    expect(clickedLink({ pageUrl: "chrome://newtab" })).toBeNull();
  });
});

describe("«Descargar con ymd» menu", () => {
  it("is created on install for links, media and pages on the web", async () => {
    const { fake } = setup();
    fake.events.installed.emit({ reason: "install" });
    await flush();
    expect(fake.record.menus).toEqual([
      {
        id: MENU_ID,
        title: "Descargar con ymd",
        contexts: ["link", "video", "audio", "page"],
        documentUrlPatterns: ["http://*/*", "https://*/*"],
        targetUrlPatterns: ["http://*/*", "https://*/*"],
      },
    ]);
    // recreated, not duplicated, on browser start
    fake.events.startup.emit();
    await flush();
    expect(fake.record.menus).toHaveLength(1);
  });

  it("a click sends the link to ymd", async () => {
    const { fake } = setup();
    fake.events.menuClicked.emit({ menuItemId: MENU_ID, linkUrl: YT, pageUrl: "https://a.com/" });
    await flush();
    expect(opens(fake)).toEqual([{ type: "open", version: 1, url: YT }]);
  });

  it("ignores other menus and links that aren't on the web", async () => {
    const { fake } = setup();
    fake.events.menuClicked.emit({ menuItemId: "other", linkUrl: YT });
    fake.events.menuClicked.emit({ menuItemId: MENU_ID, pageUrl: "chrome://settings" });
    await flush();
    expect(opens(fake)).toEqual([]);
  });

  it("a missing ymd is recorded, so the popup shows it", async () => {
    const { fake, engine } = setup({ native: { lastError: HOST_NOT_FOUND } });
    const res = await engine.open(YT);
    expect(res.ok).toBe(false);
    expect((fake.store.get(KEYS.status) as { error: { code: string } }).error.code).toBe(
      "host_not_found",
    );
  });
});

describe("popup «Esta página»", () => {
  const html = readFileSync(resolve(EXTENSION_DIR, "popup.html"), "utf8");
  const BODY = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? "";
  beforeEach(() => {
    document.body.innerHTML = BODY;
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });
  const $ = (id: string) => document.getElementById(id) as HTMLElement;

  async function mount(options: FakeOptions) {
    const { fake } = setup(options);
    const view = await mountPopup(document, { api: fake.api, now: () => 1 });
    return { fake, view };
  }

  it("shows the active site and sends it to ymd", async () => {
    const { fake, view } = await mount({ activeTab: { url: YT } });
    expect($("current").hidden).toBe(false);
    expect($("current-host").textContent).toBe("youtube.com");
    await view.downloadPage();
    expect(opens(fake)).toEqual([{ type: "open", version: 1, url: YT }]);
    expect($("download-result").textContent).toBe("Enviado a ymd. Revisa la ventana de ymd.");
    expect($("download-result").dataset.tone).toBe("ok");
  });

  it("explains when ymd can't be reached", async () => {
    const { view } = await mount({ activeTab: { url: YT }, native: { lastError: HOST_NOT_FOUND } });
    await view.downloadPage();
    expect($("download-result").dataset.tone).toBe("error");
    expect($("download-result").textContent).toMatch(/No se pudo abrir ymd/);
  });

  it("stays hidden on browser pages and with no tab", async () => {
    await mount({ activeTab: { url: "chrome://extensions" } });
    expect($("current").hidden).toBe(true);
    document.body.innerHTML = BODY;
    await mount({});
    expect($("current").hidden).toBe(true);
  });

  it("the worker answers an open request only from the popup", async () => {
    const { fake } = setup();
    const [listener] = fake.events.message.listeners;
    let reply: OpenResult | undefined;
    expect(
      listener({ type: "open", url: YT }, POPUP_SENDER, (r) => (reply = r as OpenResult)),
    ).toBe(true);
    expect(listener({ type: "open" }, POPUP_SENDER, () => undefined)).toBe(false);
    await flush();
    expect(reply).toEqual({ ok: true, error: null });
  });
});
