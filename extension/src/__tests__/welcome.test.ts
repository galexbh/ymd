import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KEYS } from "../lib/storage";
import { mountWelcome, PIN_POLL_MS, watchPin } from "../lib/welcome-view";
import {
  createChromeFake,
  EXTENSION_DIR,
  flush,
  type FakeOptions,
  type Locale,
  SHIPPED_HOSTS,
} from "../test/chrome-fake";

const html = readFileSync(resolve(EXTENSION_DIR, "welcome.html"), "utf8");
const BODY = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? "";

describe("welcome page", () => {
  beforeEach(() => {
    document.body.innerHTML = BODY;
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });
  const $ = (id: string) => document.getElementById(id) as HTMLElement;
  const chips = () =>
    [...document.querySelectorAll("#other-list button")].map((c) => c.textContent);

  async function mount(options: FakeOptions, locale: Locale = "es") {
    const fake = createChromeFake({ locale, ...options });
    const view = await mountWelcome(document, { api: fake.api });
    return { fake, view };
  }

  it("guides pinning and confirms it once the person pins the extension", async () => {
    const { fake, view } = await mount({ pinned: false });
    expect(document.querySelector("h1")?.textContent).toBe("ymd Cookies está instalada");
    expect($("step-pin").dataset.done).toBe("false");
    expect($("pin-state").hidden).toBe(false);
    expect($("pin-state").textContent).toBe("Aún no está fijada.");

    fake.setPinned(true);
    await view.checkPin();
    expect($("step-pin").dataset.done).toBe("true");
    expect($("pin-state").textContent).toBe("Fijada: ya la tienes en la barra.");
    expect($("pin-state").dataset.tone).toBe("ok");
  });

  it("stops looking once the extension is pinned", async () => {
    const { fake, view } = await mount({ pinned: false });
    let tick: (() => void) | undefined;
    let cleared = false;
    const focus = new EventTarget();
    const calls: number[] = [];
    const checkPin = async () => {
      calls.push(1);
      return view.checkPin();
    };
    watchPin(checkPin, {
      doc: document,
      win: focus as unknown as Window,
      setInterval: (fn, ms) => {
        expect(ms).toBe(PIN_POLL_MS);
        tick = fn;
        return 7;
      },
      clearInterval: (h) => {
        expect(h).toBe(7);
        cleared = true;
      },
    });
    tick?.();
    await flush(2);
    expect(cleared).toBe(false);
    fake.setPinned(true);
    tick?.();
    await flush(2);
    expect(cleared).toBe(true);
    expect($("step-pin").dataset.done).toBe("true");
    const before = calls.length;
    tick?.();
    focus.dispatchEvent(new Event("focus"));
    await flush(2);
    expect(calls).toHaveLength(before);
  });

  it("hides the pin state where the browser cannot tell", async () => {
    const fake = createChromeFake();
    delete fake.api.action.getUserSettings;
    const view = await mountWelcome(document, { api: fake.api });
    expect(await view.checkPin()).toBe(true); // nothing to watch
    expect($("pin-state").hidden).toBe(true);
    expect($("step-pin").dataset.done).toBe("false");
  });

  it("build ymd ships: YouTube is ready, the other sites are offered", async () => {
    await mount({ hostPermissions: SHIPPED_HOSTS, sites: ["youtube.com"] });
    expect($("youtube-ready").hidden).toBe(false);
    expect($("use-youtube").hidden).toBe(true);
    expect($("step-sites").dataset.done).toBe("true");
    expect(chips()).toEqual(["Vimeo", "SoundCloud", "Twitch"]);
  });

  it("store build: «Usar YouTube» asks for youtube.com in the click and adds it", async () => {
    const { fake } = await mount({ grant: true });
    expect($("youtube-ready").hidden).toBe(true);
    expect($("use-youtube").hidden).toBe(false);
    expect($("step-sites").dataset.done).toBe("false");
    $("use-youtube").click();
    await flush();
    expect(fake.record.permissionRequests).toEqual([["*://*.youtube.com/*"]]);
    expect(fake.store.get(KEYS.allowlist)).toEqual(["youtube.com"]);
    expect($("youtube-ready").hidden).toBe(false);
    expect($("use-youtube").hidden).toBe(true);
    expect($("sites-result").textContent).toBe("Listo: ymd recibirá tu sesión de YouTube.");
    expect($("step-sites").dataset.done).toBe("true");
  });

  it("a denied permission explains why and adds nothing", async () => {
    const { fake } = await mount({ grant: false });
    $("use-youtube").click();
    await flush();
    expect($("sites-result").dataset.tone).toBe("error");
    expect($("sites-result").textContent).toBe(
      "Sin el permiso del navegador no se pueden leer las cookies de youtube.com.",
    );
    expect(fake.store.has(KEYS.allowlist)).toBe(false);
    expect($("use-youtube").hidden).toBe(false);
  });

  it("another suggestion is one click too", async () => {
    const { fake } = await mount({ grant: true, sites: ["youtube.com"] });
    (document.querySelector("#other-list button") as HTMLElement).click();
    await flush();
    expect(fake.record.permissionRequests).toEqual([["*://*.vimeo.com/*"]]);
    expect(chips()).toEqual(["SoundCloud", "Twitch"]);
  });

  it("follows the list when the popup changes it", async () => {
    const { fake } = await mount({ grant: true });
    await fake.api.storage.local.set({ [KEYS.allowlist]: ["youtube.com"] });
    expect($("youtube-ready").hidden).toBe(false);
  });

  it("reads in English", async () => {
    await mount({ hostPermissions: SHIPPED_HOSTS, sites: ["youtube.com"] }, "en");
    expect(document.querySelector("h1")?.textContent).toBe("ymd Cookies is installed");
    expect(document.documentElement.lang).toBe("en");
    expect($("youtube-ready").textContent?.trim()).toBe(
      "YouTube is ready: ymd will get your session once you sign in in this browser.",
    );
  });
});
