import { describe, expect, it } from "vitest";
import { clickedLink, webLink } from "../lib/links";
import { KEYS } from "../lib/storage";
import { COMMAND_ID, createSyncEngine, installBackground, MENU_ID } from "../lib/sync";
import {
  createChromeFake,
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

  it("uses an embedded player (frame) before the page", () => {
    const frame = "https://player.vimeo.com/video/76979871";
    expect(clickedLink({ frameUrl: frame, pageUrl: "https://blog.example.com/post" })).toBe(frame);
    expect(
      clickedLink({ srcUrl: "blob:https://player.vimeo.com/x", frameUrl: frame, pageUrl: YT }),
    ).toBe(frame);
  });

  it("uses selected text only when it is a web link", () => {
    expect(clickedLink({ selectionText: ` ${YT} `, pageUrl: "https://a.com/" })).toBe(YT);
    expect(clickedLink({ selectionText: "a cat video", pageUrl: "https://a.com/" })).toBe(
      "https://a.com/",
    );
    expect(clickedLink({ selectionText: "javascript:alert(1)", pageUrl: YT })).toBe(YT);
  });

  it("a mailto: or blob: link falls back to the page", () => {
    expect(clickedLink({ linkUrl: "mailto:a@b.com", pageUrl: YT })).toBe(YT);
    expect(clickedLink({ linkUrl: "blob:https://a.com/x", pageUrl: YT })).toBe(YT);
  });
});

describe("«Descargar con ymd» menu", () => {
  it("is created on install for links, media, frames, selections and pages on the web", async () => {
    const { fake } = setup();
    fake.events.installed.emit({ reason: "install" });
    await flush();
    expect(fake.record.menus).toEqual([
      {
        id: MENU_ID,
        title: "Descargar con ymd",
        contexts: ["link", "video", "audio", "frame", "selection", "page"],
        documentUrlPatterns: ["http://*/*", "https://*/*"],
      },
    ]);
    // no targetUrlPatterns: on YouTube the <video> is a blob: URL and it would hide the item
    expect(fake.record.menus[0]).not.toHaveProperty("targetUrlPatterns");
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

  it("a right-click on YouTube's player (a blob: video) sends the page", async () => {
    const { fake } = setup();
    fake.events.menuClicked.emit({
      menuItemId: MENU_ID,
      srcUrl: "blob:https://www.youtube.com/0b1c",
      pageUrl: YT,
    });
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

describe("Alt+Shift+Y shortcut", () => {
  it("sends the active tab to ymd", async () => {
    const { fake } = setup({ activeTab: { url: YT } });
    fake.events.command.emit(COMMAND_ID);
    await flush();
    expect(opens(fake)).toEqual([{ type: "open", version: 1, url: YT }]);
  });

  it("ignores other commands, browser pages and no tab", async () => {
    const { fake } = setup({ activeTab: { url: "chrome://extensions" } });
    fake.events.command.emit(COMMAND_ID);
    fake.events.command.emit("other");
    const empty = setup();
    empty.fake.events.command.emit(COMMAND_ID);
    await flush();
    expect(opens(fake)).toEqual([]);
    expect(opens(empty.fake)).toEqual([]);
  });
});

describe("popup messages", () => {
  it("the worker no longer takes open requests from the popup", () => {
    const { fake } = setup();
    const [listener] = fake.events.message.listeners;
    expect(listener({ type: "open", url: YT }, POPUP_SENDER, () => undefined)).toBe(false);
    expect(opens(fake)).toEqual([]);
  });
});
