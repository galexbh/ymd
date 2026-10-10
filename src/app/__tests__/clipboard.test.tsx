import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../../ipc/types";
import { useNav } from "../../store/nav";
import { CLIPBOARD_DEBOUNCE_MS } from "../../store/clipboard";
import { calls, renderApp, type Harness } from "./harness";

const YT = "https://www.youtube.com/watch?v=clip0000001&si=abc";
const VIMEO = "https://vimeo.com/76979871";
const OTHER = "https://www.example.org/media/clip";

const READ = "plugin:clipboard-manager|read_text";

/** let the debounce elapse (real timers) and the backend answer (manual clock) */
async function settle(h: Harness) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, CLIPBOARD_DEBOUNCE_MS + 30));
  });
  await h.tick(0);
  await h.tick(0);
}

async function focusWindow(h: Harness) {
  fireEvent.focus(window);
  await settle(h);
}

const field = () => screen.getByRole("textbox", { name: "Enlace" });
const line = () => screen.getByTestId("clipboard-offer");

async function app(opts: { clipboard?: string | null; settings?: Partial<Settings> } = {}) {
  const h = await renderApp({
    clipboard: opts.clipboard ?? null,
    settings: { language: "es", ...opts.settings },
  });
  await settle(h); // the start-up check
  return h;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("clipboard links on Recibir", () => {
  it("checks once at start-up: a YouTube link fills the empty counter and is probed", async () => {
    const h = await app({ clipboard: YT });
    expect(calls(h.be, READ)).toHaveLength(1);
    expect(field()).toHaveValue(YT);
    expect(calls(h.be, "probe").map((c) => c.args?.url)).toEqual([YT]);
    expect(await screen.findByTestId("accession-card")).toBeInTheDocument();
    expect(line()).toHaveTextContent("Enlace de YouTube detectado en el portapapeles");
    expect(within(line()).getByRole("button", { name: "Deshacer" })).toBeInTheDocument();
  });

  it("on focus with an empty counter: autofill and probe, like a paste", async () => {
    const h = await app();
    expect(field()).toHaveValue("");
    h.be.setClipboard(YT);
    await focusWindow(h);
    expect(field()).toHaveValue(YT);
    expect(calls(h.be, "probe")).toHaveLength(1);
    expect(await screen.findByTestId("accession-card")).toBeInTheDocument();
  });

  it("visibilitychange to visible also checks; focus + visible together read once", async () => {
    const h = await app();
    h.be.setClipboard(VIMEO);
    const reads = calls(h.be, READ).length;
    fireEvent.focus(window);
    document.dispatchEvent(new Event("visibilitychange"));
    await settle(h);
    expect(calls(h.be, READ)).toHaveLength(reads + 1);
    expect(field()).toHaveValue(VIMEO);
  });

  it("Deshacer clears the field and the probe, and the link is not offered again", async () => {
    const h = await app();
    h.be.setClipboard(YT);
    await focusWindow(h);
    await screen.findByTestId("accession-card");
    await h.user.click(within(line()).getByRole("button", { name: "Deshacer" }));
    expect(field()).toHaveValue("");
    expect(screen.queryByTestId("accession-card")).toBeNull();
    expect(line()).toBeEmptyDOMElement();

    await focusWindow(h);
    expect(field()).toHaveValue("");
    expect(line()).toBeEmptyDOMElement();
    expect(calls(h.be, "probe")).toHaveLength(1);
  });

  it("with text in the field it suggests instead of overwriting; Usar fills and probes", async () => {
    const h = await app();
    await h.user.type(field(), "algo escrito");
    h.be.setClipboard(VIMEO);
    await focusWindow(h);
    expect(field()).toHaveValue("algo escrito");
    expect(calls(h.be, "probe")).toHaveLength(0);
    expect(line()).toHaveTextContent("¿Usar el enlace de Vimeo copiado?");
    expect(line()).toHaveTextContent(VIMEO);

    await h.user.click(within(line()).getByRole("button", { name: "Usar" }));
    await h.tick(0);
    expect(field()).toHaveValue(VIMEO);
    expect(calls(h.be, "probe").map((c) => c.args?.url)).toEqual([VIMEO]);
    expect(await screen.findByTestId("accession-card")).toBeInTheDocument();
    expect(line()).toBeEmptyDOMElement();
  });

  it("Descartar hides the suggestion and the same link does not come back", async () => {
    const h = await app();
    await h.user.type(field(), "x");
    h.be.setClipboard(VIMEO);
    await focusWindow(h);
    await h.user.click(within(line()).getByRole("button", { name: "Descartar" }));
    expect(line()).toBeEmptyDOMElement();
    expect(field()).toHaveValue("x");
    await focusWindow(h);
    expect(line()).toBeEmptyDOMElement();
  });

  it("never repeats the last offered link, even after the counter is cleared", async () => {
    const h = await app();
    h.be.setClipboard(YT);
    await focusWindow(h);
    await screen.findByTestId("accession-card");
    await h.user.clear(field());
    expect(line()).toBeEmptyDOMElement();
    await focusWindow(h);
    await focusWindow(h);
    expect(field()).toHaveValue("");
    expect(calls(h.be, "probe")).toHaveLength(1);

    // a different link is offered
    h.be.setClipboard(VIMEO);
    await focusWindow(h);
    expect(field()).toHaveValue(VIMEO);
  });

  it("skips a link already in the queue or the session ledger", async () => {
    const h = await app();
    await h.be.invoke("enqueue", {
      req: {
        url: YT,
        presetId: "best",
        playlistItems: null,
        outputDir: null,
        videoPassword: null,
        twofactor: null,
        title: null,
        thumbnail: null,
      },
    });
    await h.tick(0);
    h.be.setClipboard(YT);
    await focusWindow(h);
    expect(field()).toHaveValue("");
    expect(line()).toBeEmptyDOMElement();
    expect(calls(h.be, "probe")).toHaveLength(0);
  });

  it("ignores text that is not a single link", async () => {
    const h = await app();
    for (const text of ["hola", `${YT}\n${VIMEO}`, "ana@example.com", "javascript:alert(1)"]) {
      h.be.setClipboard(text);
      await focusWindow(h);
    }
    expect(field()).toHaveValue("");
    expect(line()).toBeEmptyDOMElement();
  });

  it("mode off: the clipboard is never read", async () => {
    const h = await app({ clipboard: YT, settings: { clipboardWatch: "off" } });
    await focusWindow(h);
    expect(calls(h.be, READ)).toHaveLength(0);
    expect(field()).toHaveValue("");
  });

  it("mode known: other sites are ignored", async () => {
    const h = await app({ settings: { clipboardWatch: "known" } });
    h.be.setClipboard(OTHER);
    await focusWindow(h);
    expect(calls(h.be, READ).length).toBeGreaterThan(0);
    expect(field()).toHaveValue("");
    expect(line()).toBeEmptyDOMElement();
  });

  it("mode any: an unknown link is only suggested, never auto-filled", async () => {
    const h = await app({ settings: { clipboardWatch: "any" } });
    h.be.setClipboard(OTHER);
    await focusWindow(h);
    expect(field()).toHaveValue("");
    expect(calls(h.be, "probe")).toHaveLength(0);
    expect(line()).toHaveTextContent("¿Usar el enlace de example.org copiado?");
    // known links still fill the empty counter
    await h.user.click(within(line()).getByRole("button", { name: "Descartar" }));
    h.be.setClipboard(YT);
    await focusWindow(h);
    expect(field()).toHaveValue(YT);
  });

  it("only looks while Recibir is open, and looks again on coming back to it", async () => {
    const h = await app();
    act(() => useNav.getState().navigate("catalog"));
    await h.tick(0);
    const reads = calls(h.be, READ).length;
    h.be.setClipboard(YT);
    await focusWindow(h);
    expect(calls(h.be, READ)).toHaveLength(reads);
    act(() => useNav.getState().navigate("receive"));
    await settle(h);
    expect(calls(h.be, READ)).toHaveLength(reads + 1);
    expect(field()).toHaveValue(YT);
  });

  it("writes nothing from the clipboard to localStorage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const h = await app();
    h.be.setClipboard(YT);
    await focusWindow(h);
    await screen.findByTestId("accession-card");
    await h.user.click(within(line()).getByRole("button", { name: "Deshacer" }));
    await h.user.type(field(), "x");
    h.be.setClipboard(VIMEO);
    await focusWindow(h);
    await h.user.click(within(line()).getByRole("button", { name: "Descartar" }));
    const written = setItem.mock.calls.map((c) => `${c[0]}=${c[1]}`).join("\n");
    expect(written).not.toContain("youtube");
    expect(written).not.toContain("vimeo");
    const stored = Object.keys(localStorage)
      .map((k) => `${k}=${localStorage.getItem(k)}`)
      .join("\n");
    expect(stored).not.toContain("youtube");
    expect(stored).not.toContain("vimeo");
  });
});

describe("Ajustes → Descargas → Portapapeles", () => {
  it("switches the mode and explains the privacy rule", async () => {
    const h = await renderApp({ route: "settings", section: "downloads" });
    const group = screen.getByRole("radiogroup", { name: "Detectar enlaces copiados" });
    expect(within(group).getByRole("radio", { name: "Solo sitios conocidos" })).toBeChecked();
    expect(
      screen.getByText(
        "ymd lee el portapapeles solo cuando vuelves a la ventana, ignora lo que no sea un enlace y nunca lo guarda.",
      ),
    ).toBeInTheDocument();
    await h.user.click(within(group).getByRole("radio", { name: "Apagado" }));
    await h.tick(0);
    await h.tick(1000);
    expect(within(group).getByRole("radio", { name: "Apagado" })).toBeChecked();
    expect(screen.getByText("ymd no mira el portapapeles.")).toBeInTheDocument();
    expect(h.be.snapshot().settings.clipboardWatch).toBe("off");
    await h.user.click(within(group).getByRole("radio", { name: "Cualquier enlace" }));
    await h.tick(1000);
    expect(h.be.snapshot().settings.clipboardWatch).toBe("any");
  });
});
