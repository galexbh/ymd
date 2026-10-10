import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROVIDERS } from "../../../src/shared/providers";
import { siteToOffer } from "../lib/current-site";
import { mountPopup } from "../lib/popup-view";
import { KEYS } from "../lib/storage";
import {
  createChromeFake,
  EXTENSION_DIR,
  type FakeOptions,
  type Locale,
} from "../test/chrome-fake";

describe("siteToOffer", () => {
  it("offers a known site that the list doesn't cover, by its main domain", () => {
    expect(siteToOffer("https://vimeo.com/76979871", ["youtube.com"])).toEqual({
      name: "Vimeo",
      domain: "vimeo.com",
    });
    expect(siteToOffer("https://player.vimeo.com/video/1", ["youtube.com"])).toEqual({
      name: "Vimeo",
      domain: "vimeo.com",
    });
    expect(siteToOffer("https://v.redd.it/abc", [])).toEqual({
      name: "Reddit",
      domain: "reddit.com",
    });
  });

  it("offers nothing for unknown sites, covered sites, shared hosts or browser pages", () => {
    expect(siteToOffer("https://www.example.org/x", [])).toBeNull();
    expect(siteToOffer("https://music.youtube.com/watch?v=1", ["youtube.com"])).toBeNull();
    expect(siteToOffer("https://vimeo.com/1", ["vimeo.com"])).toBeNull();
    expect(siteToOffer("https://someone.github.io/", [])).toBeNull();
    expect(siteToOffer("chrome://extensions", [])).toBeNull();
    expect(siteToOffer(undefined, [])).toBeNull();
  });

  it("uses the same provider list as the app", () => {
    const app = readFileSync(resolve(EXTENSION_DIR, "../src/app/clipboardLink.ts"), "utf8");
    expect(app).toContain('from "../shared/providers"');
    expect(PROVIDERS.length).toBeGreaterThan(10);
  });
});

describe("popup «Usar mi sesión de…»", () => {
  const html = readFileSync(resolve(EXTENSION_DIR, "popup.html"), "utf8");
  const BODY = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? "";
  beforeEach(() => {
    document.body.innerHTML = BODY;
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });
  const $ = (id: string) => document.getElementById(id) as HTMLElement;

  async function mount(options: FakeOptions, locale: Locale = "es") {
    const fake = createChromeFake({ locale, ...options });
    const view = await mountPopup(document, { api: fake.api, now: () => 1 });
    return { fake, view };
  }

  it("on vimeo.com: one click asks for vimeo.com and adds it", async () => {
    const { fake, view } = await mount({
      activeTab: { url: "https://vimeo.com/76979871" },
      grant: true,
      sites: ["youtube.com"],
    });
    expect($("add-current").hidden).toBe(false);
    expect($("add-current-label").textContent).toBe("Usar mi sesión de Vimeo en ymd");
    await view.addCurrentSite();
    expect(fake.record.permissionRequests).toEqual([["*://*.vimeo.com/*"]]);
    expect(fake.store.get(KEYS.allowlist)).toEqual(["youtube.com", "vimeo.com"]);
    expect($("add-current-result").textContent).toBe("Listo: ymd recibirá tu sesión de Vimeo.");
    // offered once: now covered
    expect($("add-current").hidden).toBe(true);
    expect(
      [...document.querySelectorAll("#site-list .domain")].map((d) => d.textContent),
    ).toContain("vimeo.com");
  });

  it("explains a denied permission and keeps the offer", async () => {
    const { view } = await mount({ activeTab: { url: "https://soundcloud.com/a" }, grant: false });
    await view.addCurrentSite();
    expect($("add-current-result").dataset.tone).toBe("error");
    expect($("add-current-result").textContent).toMatch(/soundcloud\.com/);
    expect($("add-current").hidden).toBe(false);
  });

  it("stays hidden on YouTube (already on the list) and on unknown sites", async () => {
    await mount({
      activeTab: { url: "https://www.youtube.com/watch?v=1" },
      sites: ["youtube.com"],
    });
    expect($("add-current").hidden).toBe(true);
    document.body.innerHTML = BODY;
    await mount({ activeTab: { url: "https://www.example.org/" } });
    expect($("add-current").hidden).toBe(true);
  });

  it("reads in English", async () => {
    await mount({ activeTab: { url: "https://www.twitch.tv/x" } }, "en");
    expect($("add-current-label").textContent).toBe("Use my Twitch session in ymd");
  });
});
