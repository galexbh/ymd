import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useNav } from "../../store/nav";
import { calls, renderApp } from "./harness";

const enqueue = (url: string) => ({
  req: {
    url,
    presetId: "best",
    playlistItems: null,
    outputDir: null,
    videoPassword: null,
    twofactor: null,
    title: null,
    thumbnail: null,
  },
});

describe("shell", () => {
  it("shows the rail with versions and a live count on Registro", async () => {
    const { be, tick } = await renderApp({ settings: { language: "es", concurrency: 1 } });
    expect(screen.getByTestId("rail-ytdlp")).toHaveTextContent("2026.10.07.234512");
    expect(screen.getByText("Node.js v22.11.0")).toBeInTheDocument();
    await be.invoke("enqueue", enqueue("https://www.youtube.com/watch?v=aaaaaaa0001"));
    await be.invoke("enqueue", enqueue("https://www.youtube.com/watch?v=aaaaaaa0002"));
    await tick(0);
    expect(
      within(screen.getByTestId("nav-queue")).getByLabelText("2 descargas en curso o en cola"),
    ).toBeInTheDocument();
  });

  it("navigates with the rail and Ctrl+1..5, Ctrl+, opens Ajustes", async () => {
    const { user, tick } = await renderApp();
    await user.click(screen.getByTestId("nav-catalog"));
    expect(screen.getByRole("heading", { level: 1, name: "Catálogo" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#catalog");
    fireEvent.keyDown(window, { key: "4", ctrlKey: true });
    await tick(0);
    expect(screen.getByRole("heading", { level: 1, name: "Dependencias" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    await tick(0);
    expect(screen.getByRole("heading", { level: 1, name: "Ajustes" })).toBeInTheDocument();
    expect(screen.getByTestId("nav-settings")).toHaveAttribute("aria-current", "page");
  });

  it("Ctrl+L goes to the counter and focuses the link field", async () => {
    const { tick } = await renderApp({ route: "deps" });
    fireEvent.keyDown(window, { key: "l", ctrlKey: true });
    await tick(0);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(useNav.getState().route).toBe("receive");
    expect(screen.getByRole("textbox", { name: "Enlace" })).toHaveFocus();
  });

  it("Ctrl+V on the empty counter moves focus into the link field so the paste lands there", async () => {
    await renderApp();
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(window, { key: "v", ctrlKey: true });
    expect(screen.getByRole("textbox", { name: "Enlace" })).toHaveFocus();
  });

  it("? opens the list of shortcuts", async () => {
    const { user } = await renderApp();
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(window, { key: "?" });
    const dialog = await screen.findByRole("dialog", { name: "Atajos de teclado" });
    expect(within(dialog).getByText("Ir al campo del enlace")).toBeInTheDocument();
    await user.keyboard("{Escape}");
  });

  it("Registro filters by stage and totals the queue", async () => {
    const { be, user, tick } = await renderApp({ route: "queue" });
    expect(screen.getByText("El registro está vacío")).toBeInTheDocument();
    await be.invoke("enqueue", enqueue("https://www.youtube.com/watch?v=botcheck123"));
    await be.invoke("enqueue", enqueue("https://www.youtube.com/watch?v=okvideo0001"));
    await tick(300);
    const totals = screen.getByTestId("queue-totals");
    expect(totals).toHaveTextContent(/En curso\s*1/);
    await user.click(screen.getByRole("radio", { name: "Fallidas" }));
    expect(screen.getAllByTestId(/^queue-item-/)).toHaveLength(1);
    await user.click(screen.getByRole("radio", { name: "Archivadas" }));
    expect(screen.getByText("Ninguna descarga coincide con este filtro.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Limpiar terminados" }));
    await tick(0);
    expect(calls(be, "jobs_clear_finished")).toHaveLength(1);
  });

  it("boots the dev gallery only with ?gallery", async () => {
    await renderApp();
    expect(screen.queryByText(/gallery/i)).toBeNull();
  });
});
