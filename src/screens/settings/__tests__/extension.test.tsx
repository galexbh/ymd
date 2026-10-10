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
  forkExtensionsUrl,
  pageBrowser,
  syncBrowserName,
} from "../extension";

const SYNC: ExtensionSync = {
  at: "2026-10-08T14:56:00.000Z",
  browser: "brave",
  cookieCount: 42,
  domains: [".youtube.com", ".google.com"],
};

const accounts = { route: "settings", section: "accounts" } as const;

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

  it("leads the cookie remedies on Windows with Brave: above the cookies.txt guide, now the alternative", async () => {
    await renderApp(accounts);
    const c = await card();
    const guide = screen.getByTestId("cookie-guide");
    expect(c).toHaveAttribute("data-prominent", "true");
    expect(c.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      within(guide).getByRole("heading", { name: "Alternativa: exportar cookies.txt a mano" }),
    ).toBeInTheDocument();
    expect(within(c).getByTestId("extension-id")).toHaveTextContent(
      "gicaphbpepkphmeciigjhdpnbcaflfgd",
    );
    expect(within(c).getAllByRole("listitem")).toHaveLength(4);
  });

  it("stays available but secondary elsewhere (Linux): after the guide", async () => {
    await renderApp({ ...accounts, platform: "linux" });
    const c = await card();
    const guide = screen.getByTestId("cookie-guide");
    expect(c).not.toHaveAttribute("data-prominent");
    expect(guide.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      within(guide).getByRole("heading", { name: "Exportar cookies.txt" }),
    ).toBeInTheDocument();
  });
});

describe("Ajustes → Cuentas: extensión de ymd — pasos", () => {
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
    expect(calls(be, "extension_open_page").map((x) => x.args)).toEqual([{ browser: "brave" }]);
    // Chromium won't open brave://extensions for another program: the card says what to paste.
    const notice = await within(c).findByTestId("extension-opened");
    expect(notice).toHaveTextContent("Brave está abierto");
    expect(notice).toHaveTextContent("brave://extensions");
  });

  it("targets the user's default browser first", async () => {
    const { be, user, tick } = await renderApp({
      ...accounts,
      extension: { defaultBrowser: "edge" },
      settings: { language: "es", cookies: { kind: "browser", browser: "brave", profile: null } },
    });
    const c = await card();
    await user.click(
      await within(c).findByRole("button", { name: "Abrir Edge y copiar la dirección" }),
    );
    await tick(0);
    expect(calls(be, "extension_open_page").map((x) => x.args)).toEqual([{ browser: "edge" }]);
    expect(within(c).getAllByText("edge://extensions").length).toBeGreaterThan(0);
  });

  it("with no known default, uses the Chromium browser picked as cookie source", async () => {
    const { be, user, tick } = await renderApp({
      ...accounts,
      extension: { defaultBrowser: null },
      settings: { language: "es", cookies: { kind: "browser", browser: "edge", profile: null } },
    });
    const c = await card();
    await user.click(
      await within(c).findByRole("button", { name: "Abrir Edge y copiar la dirección" }),
    );
    await tick(0);
    expect(calls(be, "extension_open_page").map((x) => x.args)).toEqual([{ browser: "edge" }]);
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
    expect(calls(be, "extension_open_page").map((x) => x.args)).toEqual([{ browser: null }]);
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
  it("picks up the first sync, switches the source to the file and says so quietly", async () => {
    const { be, tick } = await renderApp({
      ...accounts,
      settings: { language: "es", cookies: { kind: "browser", browser: "brave", profile: null } },
    });
    expect(await stamp()).toHaveTextContent("Pendiente");
    const before = calls(be, "extension_status").length;

    be.simulateExtensionSync("brave", 42, [".youtube.com", ".google.com"]);
    await poll(tick);
    expect(calls(be, "extension_status").length).toBe(before + 1);

    await waitFor(async () => expect(await stamp()).toHaveTextContent("Conectada"));
    const notice = await screen.findByText("Brave conectado: 42 cookies sincronizadas");
    expect(notice.closest("[role=status]")).toHaveTextContent(/cambió a «Archivo cookies.txt»/);
    await waitFor(() => expect(be.snapshot().settings.cookies).toEqual({ kind: "file" }));
    // the cookie copy section reflects the synced file
    const info = await screen.findByTestId("cookie-info");
    await waitFor(() => expect(info).toHaveTextContent("extension:brave"));
  });

  it("keeps an existing file source and does not repeat the notice on later syncs", async () => {
    const { be, tick } = await renderApp({
      ...accounts,
      settings: { language: "es", cookies: { kind: "file" } },
    });
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
    expect(be.snapshot().settings.cookies).toEqual({ kind: "none" });
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

describe("Ajustes → Cuentas: extensión de ymd — aviso de descifrado", () => {
  it("«Usar la extensión de ymd» scrolls to and focuses the card; the other actions remain", async () => {
    const { user, tick } = await renderApp({ ...accounts, braveRunning: false });
    await user.click(screen.getByRole("radio", { name: "Navegador" }));
    await tick(0);
    await user.click(screen.getByTestId("cookies-test"));
    await tick(0);
    await screen.findByText(/Failed to decrypt with DPAPI/);
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    expect(screen.getByRole("button", { name: "Usar cookies.txt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Usar Firefox" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Usar la extensión de ymd" }));
    const c = await card();
    expect(c).toHaveFocus();
    expect(c).toHaveAttribute("data-ring", "true");
    expect(spy.mock.contexts).toContain(c);
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
    expect(es.accounts.guide.titleAlt).toBeTruthy();
    expect(en.accounts.guide.titleAlt).toBeTruthy();
    expect(es.accounts.decrypt.useExtension).toBe("Usar la extensión de ymd");
    expect(en.accounts.decrypt.useExtension).toBe("Use the ymd extension");
  });

  it("renders in English", async () => {
    await renderApp({ ...accounts, settings: { language: "en" }, extension: { lastSync: SYNC } });
    expect(
      await screen.findByRole("heading", { name: "ymd extension for Chromium browsers" }),
    ).toBeInTheDocument();
    expect(await stamp()).toHaveTextContent("Connected");
    expect(
      screen.getByRole("button", { name: "Open Brave and copy the address" }),
    ).toBeInTheDocument();
  });
});

describe("extension helpers", () => {
  const status = {
    extensionId: "x",
    extensionDir: null,
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
