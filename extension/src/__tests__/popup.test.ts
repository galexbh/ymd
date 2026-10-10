import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountPopup } from "../lib/popup-view";
import { type Status } from "../lib/status";
import { KEYS } from "../lib/storage";
import { createSyncEngine, installBackground } from "../lib/sync";
import {
  cookie,
  createChromeFake,
  EXTENSION_DIR,
  flush,
  HOST_NOT_FOUND,
  type FakeOptions,
  type Locale,
} from "../test/chrome-fake";

const html = readFileSync(resolve(EXTENSION_DIR, "popup.html"), "utf8");
const BODY = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? "";

const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);

function status(partial: Partial<Status>): Status {
  return { lastSyncAt: null, checkedAt: null, count: 0, domains: [], error: null, ...partial };
}

async function mount(locale: Locale, options: FakeOptions = {}, dark = false) {
  const fake = createChromeFake({ locale, ...options });
  const engine = createSyncEngine({ api: fake.api, browser: async () => "chrome", now: () => NOW });
  installBackground(engine, fake.api);
  const view = await mountPopup(document, {
    api: fake.api,
    now: () => NOW,
    matchMedia: () =>
      ({ matches: dark, addEventListener: () => undefined }) as unknown as MediaQueryList,
  });
  return { fake, view };
}

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const text = (id: string) => $(id).textContent?.replace(/\s+/g, " ").trim();

beforeEach(() => {
  document.body.innerHTML = BODY;
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("popup in Spanish", () => {
  it("renders the frame, stamp and facts", async () => {
    await mount("es", {
      storage: {
        [KEYS.status]: status({ lastSyncAt: NOW - 3 * 60_000, checkedAt: NOW, count: 1234 }),
      },
    });
    expect(document.documentElement.lang).toBe("es");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.querySelector("h1")?.textContent).toBe("ymd Cookies");
    expect(text("status-head")).toBe("Puente con ymd");
    expect($("stamp").dataset.state).toBe("connected");
    expect(text("stamp-word")).toBe("Conectada");
    expect(text("stamp")).toBe("Estado: Conectada");
    expect(text("last-sync")).toBe("hace 3 min");
    expect($("last-sync").querySelector(".figure")?.textContent).toBe("3");
    expect(text("count")).toMatch(/^1.?234$/);
    expect($("notice").hidden).toBe(true);
    expect(text("send-label")).toBe("Enviar ahora");
    expect(document.querySelector(".privacy p")?.textContent).toBe(
      "Las cookies solo viajan a ymd en este equipo, sin red. Solo de los sitios de la lista.",
    );
  });

  it("shows SIN CONEXIÓN and the next step when ymd is missing", async () => {
    await mount("es", {
      storage: { [KEYS.status]: status({ error: { code: "host_not_found" } }) },
    });
    expect($("stamp").dataset.state).toBe("offline");
    expect(text("stamp-word")).toBe("Sin conexión");
    expect(text("last-sync")).toBe("Nunca");
    expect($("notice").hidden).toBe(false);
    expect(text("notice-text")).toBe("ymd no está instalado o no registró el puente.");
    expect(text("notice-hint")).toContain("Ajustes → Cuentas");
  });

  it("shows SIN CONEXIÓN before the first sync, without a notice", async () => {
    await mount("es");
    expect($("stamp").dataset.state).toBe("offline");
    expect($("notice").hidden).toBe(true);
  });

  it("shows ERROR with the host's code", async () => {
    await mount("es", {
      storage: {
        [KEYS.status]: status({ error: { code: "host_rejected", hostCode: "io_error" } }),
      },
    });
    expect($("stamp").dataset.state).toBe("error");
    expect(text("stamp-word")).toBe("Error");
    expect(text("notice-text")).toBe("ymd no pudo guardar las cookies (io_error).");
  });

  it("lists the allowed sites with the default tag", async () => {
    await mount("es");
    const rows = [...document.querySelectorAll("#site-list li")];
    expect(rows.map((r) => r.querySelector(".domain")?.textContent)).toEqual([
      "youtube.com",
      "google.com",
    ]);
    expect(rows[0].querySelector(".tag")?.textContent).toBe("Predeterminado");
    expect(rows[0].querySelector("button")?.getAttribute("aria-label")).toBe("Quitar youtube.com");
    expect($("sites-empty").hidden).toBe(true);
  });

  it("follows a dark system theme", async () => {
    await mount("es", {}, true);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("popup in English", () => {
  it("renders the stamp states in English", async () => {
    await mount("en", {
      storage: { [KEYS.status]: status({ lastSyncAt: NOW - 2 * 3_600_000, count: 7 }) },
    });
    expect(document.documentElement.lang).toBe("en");
    expect(text("stamp-word")).toBe("Connected");
    expect(text("last-sync")).toBe("2 hr. ago");
    expect(text("send-label")).toBe("Send now");
    expect(text("sites-head")).toBe("Allowed sites");
  });

  it.each([
    [{ code: "host_not_found" as const }, "offline", "Offline", "ymd is not installed"],
    [{ code: "host_failed" as const }, "error", "Error", "ymd closed before answering."],
    [{ code: "host_forbidden" as const }, "error", "Error", "does not recognize"],
  ])("error %j → %s", async (error, state, word, notice) => {
    await mount("en", { storage: { [KEYS.status]: status({ error }) } });
    expect($("stamp").dataset.state).toBe(state);
    expect(text("stamp-word")).toBe(word);
    expect(text("notice-text")).toContain(notice);
  });
});

describe("popup actions", () => {
  it("«Enviar ahora» forces a send and shows CONECTADA", async () => {
    const { fake } = await mount("es", {
      cookies: [cookie({ name: "PREF" })],
      native: { reply: { ok: true, count: 1, domains: ["youtube.com"] } },
    });
    $("send-now").click();
    expect($("send-now").getAttribute("aria-busy")).toBe("true");
    expect(text("send-label")).toBe("Enviando…");
    await flush();
    expect(fake.record.native).toHaveLength(1);
    expect($("send-now").hasAttribute("aria-busy")).toBe(false);
    expect($("stamp").dataset.state).toBe("connected");
    expect(text("count")).toBe("1");
    expect(text("last-sync")).toBe("ahora");
  });

  it("«Enviar ahora» shows the missing-host state", async () => {
    await mount("es", { native: { lastError: HOST_NOT_FOUND } });
    $("send-now").click();
    await flush();
    expect($("stamp").dataset.state).toBe("offline");
    expect($("notice").hidden).toBe(false);
  });

  it("adds a site after the permission prompt", async () => {
    const { fake } = await mount("es", { grant: true });
    ($("add-input") as HTMLInputElement).value = "vimeo.com";
    ($("add-form") as HTMLFormElement).requestSubmit();
    await flush();
    expect(fake.record.permissionRequests).toEqual([["*://*.vimeo.com/*"]]);
    expect(document.querySelectorAll("#site-list li")).toHaveLength(3);
    expect(($("add-input") as HTMLInputElement).value).toBe("");
    expect($("add-error").hidden).toBe(true);
  });

  it("explains a denied prompt and an invalid domain", async () => {
    await mount("es", { grant: false });
    const input = $("add-input") as HTMLInputElement;
    input.value = "vimeo.com";
    ($("add-form") as HTMLFormElement).requestSubmit();
    await flush();
    expect(text("add-error")).toBe(
      "Sin el permiso del navegador no se pueden leer las cookies de vimeo.com.",
    );
    expect(input.getAttribute("aria-invalid")).toBe("true");

    input.value = "nada";
    ($("add-form") as HTMLFormElement).requestSubmit();
    await flush();
    expect(text("add-error")).toBe("Escribe solo el dominio, por ejemplo vimeo.com.");

    input.dispatchEvent(new Event("input"));
    expect($("add-error").hidden).toBe(true);
  });

  it("removes a site and shows the empty state at the end", async () => {
    const { fake } = await mount("es", { storage: { [KEYS.allowlist]: ["youtube.com"] } });
    (document.querySelector('#site-list button[data-domain="youtube.com"]') as HTMLElement).click();
    await flush();
    expect(document.querySelectorAll("#site-list li")).toHaveLength(0);
    expect($("sites-empty").hidden).toBe(false);
    expect(text("sites-empty")).toBe("La lista está vacía: no se envía ninguna cookie.");
    expect(fake.store.get(KEYS.allowlist)).toEqual([]);
  });

  it("follows status written by the service worker while open", async () => {
    const { fake } = await mount("es");
    await fake.api.storage.local.set({ [KEYS.status]: status({ error: { code: "unknown" } }) });
    await flush();
    expect($("stamp").dataset.state).toBe("error");
    expect(text("notice-text")).toBe("No se pudo hablar con ymd.");
  });
});
