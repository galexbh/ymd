import { act, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { installMockBackend } from "../../ipc/mock";
import { connectBrowserLinks } from "../../store/clipboard";
import { useNav } from "../../store/nav";
import { useReceive } from "../../store/receive";
import { useSettings } from "../../store/settings";
import { calls, pasteLink, renderApp, resetStores, type Harness } from "./harness";

const YT = "https://www.youtube.com/watch?v=browser00001";
const OTHER = "https://www.example.org/media/clip";

const field = () => screen.getByRole("textbox", { name: "Enlace" });
const line = () => screen.getByTestId("clipboard-offer");

async function send(h: Harness, url: string) {
  act(() => h.be.simulateOpenUrl(url));
  await h.tick(0);
  await h.tick(0);
}

describe("«Descargar con ymd» from the browser", () => {
  it("a cold start carrying a link fills the counter and probes it", async () => {
    const h = await renderApp({ pendingUrl: YT });
    await h.tick(0);
    expect(field()).toHaveValue(YT);
    expect(calls(h.be, "probe").map((c) => c.args?.url)).toEqual([YT]);
    expect(line()).toHaveTextContent("Enlace de YouTube enviado desde el navegador");
    // handed over once
    expect(calls(h.be, "take_pending_url").length).toBeGreaterThanOrEqual(1);
  });

  it("while running: goes to Recibir, fills and probes; any site is accepted", async () => {
    const h = await renderApp({ route: "catalog" });
    await send(h, OTHER);
    expect(useNav.getState().route).toBe("receive");
    expect(field()).toHaveValue(OTHER);
    expect(calls(h.be, "probe").map((c) => c.args?.url)).toEqual([OTHER]);
    expect(line()).toHaveTextContent("Enlace de example.org enviado desde el navegador");
    // nothing is downloaded without a click
    expect(calls(h.be, "enqueue")).toHaveLength(0);
  });

  it("is not filtered by the clipboard setting", async () => {
    const h = await renderApp({ settings: { language: "es", clipboardWatch: "off" } });
    await send(h, YT);
    expect(field()).toHaveValue(YT);
  });

  it("with something on the counter it suggests instead of overwriting", async () => {
    const h = await renderApp();
    pasteLink("https://vimeo.com/76979871");
    await h.tick(0);
    await send(h, YT);
    expect(field()).toHaveValue("https://vimeo.com/76979871");
    expect(line()).toHaveTextContent("¿Usar el enlace de YouTube enviado desde el navegador?");
    await h.user.click(within(line()).getByRole("button", { name: "Usar" }));
    await h.tick(0);
    expect(field()).toHaveValue(YT);
  });

  it("Deshacer empties the counter again", async () => {
    const h = await renderApp();
    await send(h, YT);
    await h.user.click(within(line()).getByRole("button", { name: "Deshacer" }));
    expect(field()).toHaveValue("");
  });

  it("waits for onboarding before showing the link", async () => {
    const h = await renderApp({ settings: { language: "es", onboarded: false }, pendingUrl: YT });
    await h.tick(0);
    expect(calls(h.be, "probe")).toHaveLength(0);
  });

  it("ignores anything that is not a web link", async () => {
    const h = await renderApp();
    await send(h, "javascript:alert(1)");
    expect(field()).toHaveValue("");
    expect(calls(h.be, "probe")).toHaveLength(0);
  });

  it("survives a remount before settings load (React StrictMode in development)", async () => {
    resetStores();
    const be = installMockBackend({
      clock: "manual",
      pendingUrl: YT,
      settings: { language: "es" },
    });
    // mount, unmount right away, mount again: the first mount already took the link
    const off1 = connectBrowserLinks();
    off1();
    const off2 = connectBrowserLinks();
    await act(async () => {
      await be.manualClock.advanceAsync(0);
    });
    expect(useReceive.getState().url).toBe("");
    await act(async () => {
      await useSettings.getState().load();
      await be.manualClock.advanceAsync(0);
    });
    expect(useReceive.getState().url).toBe(YT);
    off2();
  });
});
