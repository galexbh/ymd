import { afterEach, describe, expect, it } from "vitest";
import { api, toCommandError } from "../../commands";
import { installMockBackend } from "..";
import { bootMock, extensionFromParam } from "../boot";
import { EXTENSION_ID } from "../fixtures";

describe("mock backend — cookie bridge", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    try {
      window.localStorage.removeItem("ymd-mock:ext");
    } catch {
      /* storage unavailable */
    }
  });

  it("defaults to an installed build: bridge registered, folder bundled, nothing synced", async () => {
    installMockBackend({ clock: "manual" });
    const st = await api.extensionStatus();
    expect(st.extensionId).toBe(EXTENSION_ID);
    expect(st.extensionDir).toBe("C:\\Program Files\\ymd\\resources\\extension");
    expect(st.hostManifest).toMatch(/com\.ymd\.cookies\.json$/);
    expect(st.targets.map((t) => t.browser)).toEqual(["brave", "chrome", "edge"]);
    expect(st.targets.every((t) => t.registered)).toBe(true);
    expect(st.targets.find((t) => t.browser === "chrome")?.installed).toBe(false);
    expect(st.lastSync).toBeNull();
  });

  it("options: no bridge, dev build without the folder, a previous sync", async () => {
    installMockBackend({
      clock: "manual",
      platform: "linux",
      extension: {
        registered: false,
        extensionDir: false,
        lastSync: { at: "2026-10-08T14:00:00Z", browser: "edge", cookieCount: 9, domains: [] },
      },
    });
    const st = await api.extensionStatus();
    expect(st.extensionDir).toBeNull();
    expect(st.targets.some((t) => t.registered)).toBe(false);
    expect(st.lastSync).toMatchObject({ browser: "edge", cookieCount: 9 });
    expect(st.hostManifest).toMatch(/^\/home\/ana\//);
  });

  it("simulateExtensionSync records the sync and writes the cookie copy with its origin", async () => {
    const be = installMockBackend({ clock: "manual", extension: { registered: false } });
    be.simulateExtensionSync("brave", 42, [".youtube.com", ".google.com"]);
    const st = await api.extensionStatus();
    expect(st.lastSync).toEqual({
      at: "2026-10-08T15:00:00.000Z",
      browser: "brave",
      cookieCount: 42,
      domains: [".youtube.com", ".google.com"],
    });
    // a delivered message proves the host is registered for that browser
    expect(st.targets.find((t) => t.browser === "brave")?.registered).toBe(true);
    expect(st.targets.find((t) => t.browser === "edge")?.registered).toBe(false);
    const info = await api.cookiesInfo();
    expect(info).toMatchObject({ origin: "extension:brave", cookieCount: 42 });
    expect(be.snapshot().extension.lastSync?.cookieCount).toBe(42);
  });

  it("setExtensionState flips registration, folder and sync", async () => {
    const be = installMockBackend({ clock: "manual" });
    be.setExtensionState({ registered: false, extensionDir: false });
    let st = await api.extensionStatus();
    expect(st.targets.some((t) => t.registered)).toBe(false);
    expect(st.extensionDir).toBeNull();
    be.simulateExtensionSync("edge", 3, []);
    be.setExtensionState({ lastSync: null });
    st = await api.extensionStatus();
    expect(st.lastSync).toBeNull();
  });

  it("extension_open_page accepts installed Chromium browsers and rejects the rest", async () => {
    const be = installMockBackend({ clock: "manual" });
    await expect(api.extensionOpenPage("brave")).resolves.toBeNull();
    await expect(api.extensionOpenPage("edge")).resolves.toBeNull();
    const chrome = await api.extensionOpenPage("chrome").catch(toCommandError);
    expect(chrome).toMatchObject({ code: "unknown" });
    const firefox = await api.extensionOpenPage("firefox").catch(toCommandError);
    expect(firefox).toMatchObject({ code: "unknown" });
    expect(be.calls.filter((c) => c.cmd === "extension_open_page").map((c) => c.args)).toEqual([
      { browser: "brave" },
      { browser: "edge" },
      { browser: "chrome" },
      { browser: "firefox" },
    ]);
  });

  it("?ext= picks the bridge state for dev", async () => {
    expect(extensionFromParam(null, 0)).toEqual({ registered: true, lastSync: null });
    expect(extensionFromParam("none", 0)).toEqual({ registered: true, lastSync: null });
    expect(extensionFromParam("nobridge", 0)).toEqual({ registered: false, lastSync: null });
    const synced = extensionFromParam("synced", Date.parse("2026-10-08T15:00:00Z"));
    expect(synced.lastSync).toMatchObject({
      at: "2026-10-08T14:56:00.000Z",
      browser: "brave",
      cookieCount: 42,
    });

    window.history.replaceState(null, "", "/?ext=synced");
    const be = bootMock();
    const st = await api.extensionStatus();
    expect(st.lastSync?.browser).toBe("brave");
    be.dispose();
  });
});
