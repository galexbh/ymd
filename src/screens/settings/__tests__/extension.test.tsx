import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, renderApp } from "../../../app/__tests__/harness";
import en from "../../../i18n/en.json";
import es from "../../../i18n/es.json";
import type { ExtensionSync } from "../../../ipc/types";
import { useNav } from "../../../store/nav";
import {
  EXTENSION_POLL_MS,
  bridgeState,
  extensionsUrl,
  cardTarget,
  extensionOutdated,
  forkExtensionsUrl,
  olderVersion,
  pageBrowser,
  STORE_URL,
  syncBrowserName,
} from "../extension";

const SYNC: ExtensionSync = {
  at: "2026-10-08T14:56:00.000Z",
  browser: "brave",
  cookieCount: 42,
  domains: [".youtube.com", ".google.com"],
  signedIn: ["youtube.com"],
  extensionVersion: "1.4.1",
  fromStore: false,
};

/** Cuentas with «Extensión» as the cookie source: the only place the card shows. */
const EXT_SETTINGS = { language: "es", cookies: { kind: "extension" } } as const;
const accounts = { route: "settings", section: "accounts", settings: EXT_SETTINGS } as const;

const card = () => screen.findByTestId("extension-card");
const stamp = async () => within(await card()).findByTestId("extension-stamp");

/** Run the card's 5 s poll (only intervals are faked; promises and timeouts stay real). */
async function poll(tick: (ms?: number) => Promise<void>) {
  act(() => {
    vi.advanceTimersByTime(EXTENSION_POLL_MS);
  });
  await tick(0);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Ajustes → Cuentas: extensión de ymd — estados", () => {
  it("CONECTADA: time, browser and cookie count from the last sync", async () => {
    await renderApp({ ...accounts, extension: { lastSync: SYNC } });
    expect(await stamp()).toHaveTextContent("Conectada");
    expect(await stamp()).toHaveAttribute("data-stage", "done");
    const facts = await screen.findByTestId("extension-sync");
    expect(within(facts).getByText("Brave")).toBeInTheDocument();
    expect(within(facts).getByText("42")).toBeInTheDocument();
    expect(within(facts).getByText(/8 oct 2026/)).toBeInTheDocument();
    expect(screen.getByTestId("extension-status")).toHaveTextContent(
      "ymd recibe las cookies de Brave",
    );
    expect(await card()).toHaveAttribute("data-state", "connected");
  });

  it("shows whether the synced copy holds a YouTube session", async () => {
    await renderApp({ ...accounts, extension: { lastSync: SYNC } });
    await stamp();
    expect(screen.getByTestId("extension-session")).toHaveTextContent("Activa");
    expect(screen.queryByTestId("extension-session-hint")).toBeNull();
  });

  it("a signed-out copy says how to fix it", async () => {
    await renderApp({ ...accounts, extension: { lastSync: { ...SYNC, signedIn: [] } } });
    await stamp();
    expect(screen.getByTestId("extension-session")).toHaveTextContent("Cerrada");
    expect(screen.getByTestId("extension-session-hint")).toHaveTextContent(
      "Inicia sesión en YouTube en Brave",
    );
  });

  it("a copy without YouTube says to add it in the extension (no site is preset)", async () => {
    await renderApp({
      ...accounts,
      extension: { lastSync: { ...SYNC, domains: [".vimeo.com"], signedIn: [] } },
    });
    await stamp();
    expect(screen.getByTestId("extension-session")).toHaveTextContent("Sin agregar");
    expect(screen.getByTestId("extension-session-hint")).toHaveTextContent(
      "Ábrela en Brave y agrega YouTube desde «Sitios sugeridos»",
    );
  });

  it("shows the synced extension version; no reload notice when it matches the bundled one", async () => {
    await renderApp({ ...accounts, extension: { lastSync: SYNC } });
    await stamp();
    const facts = screen.getByTestId("extension-sync");
    expect(within(facts).getByText("Versión de la extensión")).toBeInTheDocument();
    expect(screen.getByTestId("extension-version")).toHaveTextContent("1.4.1");
    expect(screen.queryByTestId("extension-outdated")).toBeNull();
  });

  it("an older synced extension gets a reload notice that opens the extensions page", async () => {
    const { be, user, tick } = await renderApp({
      ...accounts,
      extension: { lastSync: { ...SYNC, extensionVersion: "1.4.0" } },
    });
    await stamp();
    expect(screen.getByTestId("extension-version")).toHaveTextContent("1.4.0");
    const notice = await screen.findByTestId("extension-outdated");
    expect(notice).toHaveTextContent(
      "Hay una versión nueva de la extensión (1.4.1). Abre Brave → extensiones y pulsa recargar en ymd Cookies.",
    );
    await user.click(
      within(notice).getByRole("button", { name: "Abrir Brave y copiar la dirección" }),
    );
    await tick(0);
    expect(calls(be, "extension_open_page").map((x) => x.args)).toEqual([
      { browser: "brave", store: false },
    ]);
    expect(await screen.findByTestId("extension-opened")).toHaveTextContent("brave://extensions");
  });

  it("an older store extension gets no reload notice: the store updates it", async () => {
    await renderApp({
      ...accounts,
      extension: { lastSync: { ...SYNC, extensionVersion: "1.4.0", fromStore: true } },
    });
    await stamp();
    expect(screen.getByTestId("extension-version")).toHaveTextContent("1.4.0");
    expect(screen.queryByTestId("extension-outdated")).toBeNull();
  });

  it("a sync without a valid version shows a dash and no reload notice", async () => {
    await renderApp({ ...accounts, extension: { lastSync: { ...SYNC, extensionVersion: null } } });
    await stamp();
    expect(screen.getByTestId("extension-version")).toHaveTextContent("—");
    expect(screen.queryByTestId("extension-outdated")).toBeNull();
  });

  it("no reload notice without a bundled folder (dev build) or with a newer extension", async () => {
    await renderApp({
      ...accounts,
      extension: { extensionDir: false, lastSync: { ...SYNC, extensionVersion: "1.4.0" } },
    });
    await stamp();
    expect(screen.queryByTestId("extension-outdated")).toBeNull();
  });

  it("PENDIENTE: bridge registered, nothing synced yet", async () => {
    await renderApp(accounts);
    expect(await stamp()).toHaveTextContent("Pendiente");
    expect(await stamp()).toHaveAttribute("data-stage", "queued");
    expect(screen.getByTestId("extension-status")).toHaveTextContent(/El puente está listo/);
    expect(screen.queryByTestId("extension-sync")).toBeNull();
  });

  it("SIN PUENTE: no target registered, with the restart hint", async () => {
    await renderApp({ ...accounts, extension: { registered: false } });
    expect(await stamp()).toHaveTextContent("Sin puente");
    expect(await stamp()).toHaveAttribute("data-stage", "error");
    expect(screen.getByTestId("extension-status")).toHaveTextContent(/Reinicia ymd/);
  });

  it("leads with the store's two steps, folds the folder's four with its id, and leaves when another source is picked", async () => {
    const { user, tick } = await renderApp(accounts);
    const c = await card();
    expect(c).toHaveAttribute("data-prominent", "true");
    expect(
      within(within(c).getByTestId("extension-store-steps")).getAllByRole("listitem"),
    ).toHaveLength(2);
    const unpacked = within(c).getByTestId("extension-unpacked");
    expect(unpacked.tagName).toBe("DETAILS");
    expect(unpacked).not.toHaveAttribute("open");
    expect(unpacked).toHaveTextContent("Sin la tienda: cargar la carpeta de ymd");
    expect(within(unpacked).getAllByRole("listitem")).toHaveLength(4);
    expect(within(unpacked).getByTestId("extension-id")).toHaveTextContent(
      "gicaphbpepkphmeciigjhdpnbcaflfgd",
    );
    await user.click(screen.getByRole("radio", { name: "Firefox" }));
    await tick(0);
    expect(screen.queryByTestId("extension-card")).toBeNull();
    expect(await screen.findByTestId("browser-firefox")).toBeInTheDocument();
  });
});

describe("Ajustes → Cuentas: extensión de ymd — pasos", () => {
  it("opens the Chrome Web Store page in the target browser", async () => {
    const { be, user, tick } = await renderApp(accounts);
    const c = await card();
    expect(within(c).getByTestId("extension-store-steps")).toHaveTextContent(
      "Abre «ymd Cookies» en la Chrome Web Store con Brave",
    );
    await user.click(await within(c).findByRole("button", { name: "Abrir la tienda en Brave" }));
    await tick(0);
    expect(calls(be, "extension_open_page").map((x) => x.args)).toEqual([
      { browser: "brave", store: true },
    ]);
    // A web page opens by itself: nothing to paste.
    expect(within(c).queryByTestId("extension-opened")).toBeNull();
  });

  it("the store follows the default browser, also a Chromium fork", async () => {
    const { be, user, tick } = await renderApp({
      ...accounts,
      extension: {
        defaultBrowser: "opera",
        defaultBrowserName: "Opera GX",
        defaultBrowserChromium: true,
      },
    });
    const c = await card();
    await user.click(await within(c).findByRole("button", { name: "Abrir la tienda en Opera GX" }));
    await tick(0);
    expect(calls(be, "extension_open_page").map((x) => x.args)).toEqual([
      { browser: null, store: true },
    ]);
  });

  it("a failed store launch gives the store address to type", async () => {
    const { be, user, tick } = await renderApp(accounts);
    const c = await card();
    const orig = be.invoke.bind(be);
    vi.spyOn(be, "invoke").mockImplementation((cmd, args) =>
      cmd === "extension_open_page"
        ? Promise.reject({ code: "binary_missing", detail: "x" })
        : orig(cmd, args),
    );
    await user.click(await within(c).findByRole("button", { name: "Abrir la tienda en Brave" }));
    await tick(0);
    expect(await within(c).findByText("No se pudo abrir Brave")).toBeInTheDocument();
    expect(c).toHaveTextContent(STORE_URL);
  });

  it("on Windows, says the installer already offers it; not elsewhere", async () => {
    await renderApp(accounts);
    expect(await within(await card()).findByTestId("extension-store-offered")).toHaveTextContent(
      "El instalador de ymd ya la ofrece a Chrome, Brave y Edge",
    );
  });

  it("no installer note on macOS", async () => {
    await renderApp({ ...accounts, platform: "macos" });
    await stamp();
    expect(screen.queryByTestId("extension-store-offered")).toBeNull();
  });

  it("opens the bundled folder and Brave's extensions page", async () => {
    const { be, user, tick } = await renderApp(accounts);
    const c = await card();
    await user.click(
      await within(c).findByRole("button", { name: "Mostrar la carpeta de la extensión" }),
    );
    await user.click(within(c).getByRole("button", { name: "Abrir Brave y copiar la dirección" }));
    await tick(0);
    const opened = calls(be, "plugin:opener|reveal_item_in_dir");
    expect(opened).toHaveLength(1);
    expect(JSON.stringify(opened[0].args)).toContain(
      JSON.stringify("C:\\Program Files\\ymd\\resources\\extension").slice(1, -1),
    );
    expect(calls(be, "extension_open_page").map((x) => x.args)).toEqual([
      { browser: "brave", store: false },
    ]);
    // Chromium won't open brave://extensions for another program: the card says what to paste.
    const notice = await within(c).findByTestId("extension-opened");
    expect(notice).toHaveTextContent("Brave está abierto");
    expect(notice).toHaveTextContent("brave://extensions");
  });

  it("targets the user's default browser first", async () => {
    const { be, user, tick } = await renderApp({
      ...accounts,
      extension: { defaultBrowser: "edge" },
      settings: EXT_SETTINGS,
    });
    const c = await card();
    await user.click(
      await within(c).findByRole("button", { name: "Abrir Edge y copiar la dirección" }),
    );
    await tick(0);
    expect(calls(be, "extension_open_page").map((x) => x.args)).toEqual([
      { browser: "edge", store: false },
    ]);
    expect(within(c).getAllByText("edge://extensions").length).toBeGreaterThan(0);
  });

  it("with no known default, uses the browser that last synced", async () => {
    const { be, user, tick } = await renderApp({
      ...accounts,
      extension: { defaultBrowser: null, lastSync: { ...SYNC, browser: "edge" } },
    });
    const c = await card();
    await user.click(
      await within(c).findByRole("button", { name: "Abrir Edge y copiar la dirección" }),
    );
    await tick(0);
    expect(calls(be, "extension_open_page").map((x) => x.args)).toEqual([
      { browser: "edge", store: false },
    ]);
  });

  it("explains a failed launch with the address to type", async () => {
    const { be, user, tick } = await renderApp(accounts);
    const c = await card();
    // the browser executable could not be launched
    const orig = be.invoke.bind(be);
    vi.spyOn(be, "invoke").mockImplementation((cmd, args) =>
      cmd === "extension_open_page"
        ? Promise.reject({ code: "unknown", detail: "x" })
        : orig(cmd, args),
    );
    await user.click(
      await within(c).findByRole("button", { name: "Abrir Brave y copiar la dirección" }),
    );
    await tick(0);
    expect(await within(c).findByText("No se pudo abrir Brave")).toBeInTheDocument();
    expect(within(c).getAllByText(/brave:\/\/extensions/).length).toBeGreaterThan(0);
  });

  it("shows the folder path when it can't be opened", async () => {
    const { be, user, tick } = await renderApp(accounts);
    const c = await card();
    const orig = be.invoke.bind(be);
    vi.spyOn(be, "invoke").mockImplementation((cmd, args) =>
      cmd === "plugin:opener|reveal_item_in_dir" ? Promise.reject("not allowed") : orig(cmd, args),
    );
    await user.click(
      await within(c).findByRole("button", { name: "Mostrar la carpeta de la extensión" }),
    );
    await tick(0);
    expect(await within(c).findByText("No se pudo mostrar la carpeta")).toBeInTheDocument();
    expect(within(c).getByText(/resources\\extension/)).toBeInTheDocument();
  });

  it("a Chromium fork as default (Opera GX) is opened by its own executable", async () => {
    const { be, user, tick } = await renderApp({
      ...accounts,
      extension: {
        defaultBrowser: "opera",
        defaultBrowserName: "Opera GX",
        defaultBrowserChromium: true,
      },
    });
    const c = await card();
    await user.click(
      await within(c).findByRole("button", { name: "Abrir Opera GX y copiar la dirección" }),
    );
    await tick(0);
    expect(calls(be, "extension_open_page").map((x) => x.args)).toEqual([
      { browser: null, store: false },
    ]);
    const notice = await within(c).findByTestId("extension-opened");
    expect(notice).toHaveTextContent("Opera GX está abierto");
    expect(notice).toHaveTextContent("opera://extensions");
  });

  it("with Firefox as the default browser, offers its cookies instead of the extension", async () => {
    const { be, user, tick } = await renderApp({
      ...accounts,
      extension: { defaultBrowser: "firefox" },
    });
    const c = await card();
    const notice = await within(c).findByTestId("extension-firefox-default");
    expect(notice).toHaveTextContent("Tu navegador predeterminado es Firefox");
    await user.click(within(notice).getByRole("button", { name: "Usar cookies de Firefox" }));
    await tick(0);
    await waitFor(() =>
      expect(be.snapshot().settings.cookies).toMatchObject({ kind: "browser", browser: "firefox" }),
    );
  });

  it("disables the folder button with an explanation when the build has no folder (dev)", async () => {
    const { be } = await renderApp({ ...accounts, extension: { extensionDir: false } });
    const c = await card();
    const btn = await within(c).findByRole("button", {
      name: "Mostrar la carpeta de la extensión",
    });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription(/no incluye la carpeta de la extensión/);
    expect(calls(be, "plugin:opener|reveal_item_in_dir")).toHaveLength(0);
  });
});

describe("Ajustes → Cuentas: extensión de ymd — sondeo", () => {
  it("does not poll while the window is hidden; refreshes when it shows again", async () => {
    const { be, tick } = await renderApp(accounts);
    await stamp();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    try {
      const before = calls(be, "extension_status").length;
      await poll(tick);
      await poll(tick);
      expect(calls(be, "extension_status")).toHaveLength(before);

      visibility.mockReturnValue("visible");
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await tick(0);
      expect(calls(be, "extension_status")).toHaveLength(before + 1);
      await poll(tick);
      expect(calls(be, "extension_status")).toHaveLength(before + 2);
    } finally {
      visibility.mockRestore();
    }
  });

  it("picks up the first sync and says so quietly", async () => {
    const { be, tick } = await renderApp(accounts);
    expect(await stamp()).toHaveTextContent("Pendiente");
    const before = calls(be, "extension_status").length;

    be.simulateExtensionSync("brave", 42, [".youtube.com", ".google.com"]);
    await poll(tick);
    expect(calls(be, "extension_status").length).toBe(before + 1);

    await waitFor(async () => expect(await stamp()).toHaveTextContent("Conectada"));
    const notice = await screen.findByText("Brave conectado: 42 cookies sincronizadas");
    expect(notice.closest("[role=status]")).not.toHaveTextContent(/cambió/);
    expect(be.snapshot().settings.cookies).toEqual({ kind: "extension" });
    // the cookie copy section reflects the synced file
    const info = await screen.findByTestId("cookie-info");
    await waitFor(() => expect(info).toHaveTextContent("extension:brave"));
  });

  it("keeps the source and does not repeat the notice on later syncs", async () => {
    const { be, tick } = await renderApp(accounts);
    await stamp();
    be.simulateExtensionSync("edge", 7, []);
    await poll(tick);
    const notice = await screen.findByText("Edge conectado: 7 cookies sincronizadas");
    expect(notice.closest("[role=status]")).not.toHaveTextContent(/cambió/);
    const settingsWrites = calls(be, "settings_set").length;
    expect(settingsWrites).toBe(0);

    be.manualClock.advance(60_000);
    be.simulateExtensionSync("edge", 9, []);
    await poll(tick);
    await waitFor(() => expect(screen.getByTestId("extension-sync")).toHaveTextContent("9"));
    expect(screen.queryByText("Edge conectado: 9 cookies sincronizadas")).toBeNull();
  });

  it("a sync present on open is not a first sync: no switch, no notice", async () => {
    const { be, tick } = await renderApp({ ...accounts, extension: { lastSync: SYNC } });
    await stamp();
    await poll(tick);
    expect(screen.queryByText(/cookies sincronizadas/)).toBeNull();
    expect(be.snapshot().settings.cookies).toEqual({ kind: "extension" });
  });

  it("refreshes on window focus", async () => {
    const { be, tick } = await renderApp(accounts);
    await stamp();
    const before = calls(be, "extension_status").length;
    be.setExtensionState({ registered: false });
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await tick(0);
    expect(calls(be, "extension_status").length).toBe(before + 1);
    await waitFor(async () => expect(await stamp()).toHaveTextContent("Sin puente"));
  });

  it("stops polling once Cuentas is left: no calls after unmount", async () => {
    const { be, tick } = await renderApp(accounts);
    await stamp();
    act(() => useNav.getState().navigate("receive"));
    await tick(0);
    expect(screen.queryByTestId("extension-card")).toBeNull();
    const after = calls(be, "extension_status").length;
    await poll(tick);
    await poll(tick);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await tick(0);
    expect(calls(be, "extension_status").length).toBe(after);
  });
});

describe("Ajustes → Cuentas: extensión de ymd — idiomas", () => {
  type Tree = { [k: string]: string | Tree };
  const keys = (tree: Tree, prefix = ""): string[] =>
    Object.entries(tree).flatMap(([k, v]) =>
      typeof v === "string" ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`),
    );

  it("es and en carry the same extension keys, all filled", () => {
    const esKeys = keys(es.extension as Tree).sort();
    expect(keys(en.extension as Tree).sort()).toEqual(esKeys);
    expect(esKeys.length).toBeGreaterThan(20);
    expect(es.accounts.source.extension).toBe("Extensión");
    expect(en.accounts.source.extension).toBe("Extension");
  });

  it("renders in English", async () => {
    await renderApp({
      ...accounts,
      settings: { ...EXT_SETTINGS, language: "en" },
      extension: { lastSync: SYNC },
    });
    expect(
      await screen.findByRole("heading", { name: "ymd extension for Chromium browsers" }),
    ).toBeInTheDocument();
    expect(await stamp()).toHaveTextContent("Connected");
    expect(
      screen.getByRole("button", { name: "Open Brave and copy the address" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Extension version")).toBeInTheDocument();
  });

  it("the reload notice in English", async () => {
    await renderApp({
      ...accounts,
      settings: { ...EXT_SETTINGS, language: "en" },
      extension: { lastSync: { ...SYNC, extensionVersion: "1.3.9" } },
    });
    expect(await screen.findByTestId("extension-outdated")).toHaveTextContent(
      "A new version of the extension is available (1.4.1). Open Brave → extensions and click reload on ymd Cookies.",
    );
  });
});

describe("extension helpers", () => {
  const status = {
    extensionId: "x",
    extensionDir: null,
    bundledVersion: null,
    hostManifest: null,
    targets: [
      { browser: "brave" as const, installed: false, registered: true },
      { browser: "chrome" as const, installed: true, registered: true },
      { browser: "edge" as const, installed: true, registered: true },
    ],
    lastSync: null,
    defaultBrowser: null,
    defaultBrowserName: null,
    defaultBrowserChromium: false,
  };

  it("bridgeState", () => {
    expect(bridgeState(status)).toBe("pending");
    expect(bridgeState({ ...status, lastSync: SYNC })).toBe("connected");
    expect(
      bridgeState({ ...status, targets: status.targets.map((t) => ({ ...t, registered: false })) }),
    ).toBe("noBridge");
  });

  it("pageBrowser: chosen Chromium, then last synced, then the first installed", () => {
    expect(pageBrowser(status, "edge")).toBe("edge");
    expect(pageBrowser(status, "firefox")).toBe("chrome");
    expect(pageBrowser({ ...status, lastSync: { ...SYNC, browser: "edge" } }, null)).toBe("edge");
    expect(pageBrowser({ ...status, targets: [] }, null)).toBe("brave");
  });

  it("pageBrowser: a supported default browser wins; Firefox or Safari as default don't", () => {
    expect(pageBrowser({ ...status, defaultBrowser: "edge" }, "chrome")).toBe("edge");
    expect(pageBrowser({ ...status, defaultBrowser: "firefox" }, "edge")).toBe("edge");
    expect(pageBrowser({ ...status, defaultBrowser: "safari" }, null)).toBe("chrome");
  });

  it("cardTarget: a Chromium fork as default is launched by its executable, with its own page", () => {
    expect(
      cardTarget(
        {
          ...status,
          defaultBrowser: "opera",
          defaultBrowserName: "Opera GX",
          defaultBrowserChromium: true,
        },
        null,
      ),
    ).toEqual({ browser: null, name: "Opera GX", url: "opera://extensions" });
    expect(
      cardTarget({ ...status, defaultBrowserName: "Yandex", defaultBrowserChromium: true }, null),
    ).toEqual({ browser: null, name: "Yandex", url: "browser://extensions" });
    expect(
      cardTarget({ ...status, defaultBrowserName: "Arc", defaultBrowserChromium: true }, null),
    ).toEqual({ browser: null, name: "Arc", url: "chrome://extensions" });
    // a browser ymd registers by name keeps its own target
    expect(
      cardTarget(
        {
          ...status,
          defaultBrowser: "edge",
          defaultBrowserName: "Edge",
          defaultBrowserChromium: true,
        },
        null,
      ),
    ).toEqual({ browser: "edge", name: "Edge", url: "edge://extensions" });
  });

  it("olderVersion compares dot-separated numbers", () => {
    expect(olderVersion("1.4.0", "1.4.1")).toBe(true);
    expect(olderVersion("1.4.1", "1.4.1")).toBe(false);
    expect(olderVersion("1.4.2", "1.4.1")).toBe(false);
    expect(olderVersion("1.9", "1.10")).toBe(true);
    expect(olderVersion("1.10", "1.9")).toBe(false);
    expect(olderVersion("1.4", "1.4.0")).toBe(false);
    expect(olderVersion("1.4", "1.4.1")).toBe(true);
    expect(olderVersion("2", "1.99.99")).toBe(false);
    expect(olderVersion("x", "0.1")).toBe(true);
  });

  it("extensionOutdated needs a bundled version and a synced one", () => {
    const bundled = { ...status, bundledVersion: "1.4.1" };
    expect(extensionOutdated(bundled)).toBe(false);
    expect(extensionOutdated({ ...bundled, lastSync: SYNC })).toBe(false);
    expect(
      extensionOutdated({ ...bundled, lastSync: { ...SYNC, extensionVersion: "1.4.0" } }),
    ).toBe(true);
    expect(extensionOutdated({ ...bundled, lastSync: { ...SYNC, extensionVersion: null } })).toBe(
      false,
    );
    expect(extensionOutdated({ ...status, lastSync: { ...SYNC, extensionVersion: "1.4.0" } })).toBe(
      false,
    );
    // The store build updates itself: an older one is the store's pace, not the user's.
    expect(
      extensionOutdated({
        ...bundled,
        lastSync: { ...SYNC, extensionVersion: "1.4.0", fromStore: true },
      }),
    ).toBe(false);
  });

  it("forkExtensionsUrl", () => {
    expect(forkExtensionsUrl("Opera")).toBe("opera://extensions");
    expect(forkExtensionsUrl("Opera GX")).toBe("opera://extensions");
    expect(forkExtensionsUrl("Yandex")).toBe("browser://extensions");
    expect(forkExtensionsUrl("Whale")).toBe("whale://extensions");
    expect(forkExtensionsUrl("Thorium")).toBe("chrome://extensions");
  });

  it("extensionsUrl", () => {
    expect(extensionsUrl("brave")).toBe("brave://extensions");
    expect(extensionsUrl("chrome")).toBe("chrome://extensions");
    expect(extensionsUrl("chromium")).toBe("chrome://extensions");
    expect(extensionsUrl("edge")).toBe("edge://extensions");
    expect(extensionsUrl("vivaldi")).toBe("vivaldi://extensions");
  });

  it("syncBrowserName", () => {
    expect(syncBrowserName("brave")).toBe("Brave");
    expect(syncBrowserName("other")).toBe("Other");
    expect(syncBrowserName("")).toBe("");
  });
});
