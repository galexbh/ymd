import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { calls, renderApp } from "../../../app/__tests__/harness";

const rows = () => screen.queryAllByTestId(/^catalog-row-/);

describe("Catálogo", () => {
  it("lists a page of history, flags missing files and paginates", async () => {
    const { user, tick } = await renderApp({ route: "catalog" });
    await waitFor(() => expect(rows().length).toBe(20));
    expect(screen.getAllByText("Archivo movido o borrado").length).toBeGreaterThan(0);
    const next = screen.getByRole("button", { name: "Página siguiente" });
    await user.click(next);
    await tick(0);
    await waitFor(() => expect(rows().length).toBeLessThan(20));
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeEnabled();
  });

  it("searches with a debounce and filters by kind", async () => {
    const { be, user } = await renderApp({ route: "catalog" });
    await waitFor(() => expect(rows().length).toBe(20));
    const before = calls(be, "history_query").length;
    await user.type(screen.getByRole("searchbox", { name: "Buscar en el catálogo" }), "lo-fi");
    await waitFor(() => expect(rows()).toHaveLength(1));
    // one query for the whole word, not one per keystroke
    expect(calls(be, "history_query").length - before).toBe(1);

    await user.clear(screen.getByRole("searchbox", { name: "Buscar en el catálogo" }));
    await waitFor(() => expect(rows().length).toBe(20));
    await user.click(screen.getByRole("radio", { name: "Audio" }));
    await waitFor(() =>
      expect(calls(be, "history_query").slice(-1)[0].args!.query).toMatchObject({ kind: "audio" }),
    );
  });

  it("explains an empty search", async () => {
    const { user } = await renderApp({ route: "catalog" });
    await user.type(screen.getByRole("searchbox"), "zzzz-nothing");
    expect(await screen.findByText("Sin resultados")).toBeInTheDocument();
  });

  it("deletes one entry and clears all after confirming", async () => {
    const { be, user, tick } = await renderApp({ route: "catalog" });
    await waitFor(() => expect(rows().length).toBe(20));
    const total = be.snapshot().history.length;
    const first = rows()[0];
    await user.click(within(first).getByRole("button", { name: /^Borrar .* del catálogo$/ }));
    await tick(0);
    expect(be.snapshot().history.length).toBe(total - 1);

    await user.click(screen.getByRole("button", { name: "Vaciar catálogo" }));
    const dialog = await screen.findByRole("dialog", { name: "¿Vaciar el catálogo?" });
    await user.click(within(dialog).getByRole("button", { name: "Vaciar catálogo" }));
    await tick(0);
    expect(await screen.findByText("El catálogo está vacío")).toBeInTheDocument();
    expect(be.snapshot().history).toEqual([]);
  });

  it("re-download prefills the counter and probes the link", async () => {
    const { be, user, tick } = await renderApp({ route: "catalog" });
    await waitFor(() => expect(rows().length).toBe(20));
    const first = rows()[0];
    await user.click(within(first).getByRole("button", { name: /^Volver a descargar/ }));
    await tick(0);
    expect(screen.getByRole("textbox", { name: "Enlace" })).not.toHaveValue("");
    expect(calls(be, "probe")).toHaveLength(1);
    expect(await screen.findByTestId("accession-card")).toBeInTheDocument();
  });

  it("opens the file and its folder through the opener plugin", async () => {
    const { be, user, tick } = await renderApp({ route: "catalog" });
    await waitFor(() => expect(rows().length).toBe(20));
    const first = rows()[0];
    await user.click(within(first).getByRole("button", { name: /^Abrir / }));
    await user.click(within(first).getByRole("button", { name: /en la carpeta$/ }));
    await tick(0);
    expect(calls(be, "plugin:opener|open_path")).toHaveLength(1);
    expect(calls(be, "plugin:opener|reveal_item_in_dir")).toHaveLength(1);
  });

  it("shows the accession number, finds a row by it and translates builtin presets by id", async () => {
    const { user } = await renderApp({ route: "catalog" });
    await waitFor(() => expect(rows().length).toBe(20));
    expect(screen.getByRole("columnheader", { name: "N.º" })).toBeInTheDocument();
    const newest = rows()[0];
    expect(within(newest).getByText("000025")).toBeInTheDocument();
    // "Best quality" stored, shown by id in the UI language
    expect(screen.getAllByText("Mejor calidad").length).toBeGreaterThan(0);
    expect(screen.queryByText("Best quality")).toBeNull();

    await user.type(screen.getByRole("searchbox"), "000012");
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(within(rows()[0]).getByText("000012")).toBeInTheDocument();
  });

  it("legacy rows without a number show an em dash and keep their stored preset name", async () => {
    const { user, tick } = await renderApp({ route: "catalog" });
    await waitFor(() => expect(rows().length).toBe(20));
    await user.click(screen.getByRole("button", { name: "Página siguiente" }));
    await tick(0);
    await waitFor(() => expect(rows().length).toBe(5));
    const oldest = rows()[rows().length - 1];
    expect(within(oldest).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("the number carries from the counter through the ledger into the catalog", async () => {
    const { user, tick } = await renderApp();
    await user.type(
      screen.getByRole("textbox", { name: "Enlace" }),
      "https://www.youtube.com/watch?v=carry000001{Enter}",
    );
    await tick(0);
    const [row] = screen.getAllByTestId(/^queue-item-/);
    expect(within(row).getByText("000026")).toBeInTheDocument();
    await tick(40_000);
    // the archive stamp carries the filing date
    expect(within(row).getByText(/2026/).tagName).toBe("TIME");
    await user.click(screen.getByTestId("nav-catalog"));
    await tick(0);
    await waitFor(() => expect(within(rows()[0]).getByText("000026")).toBeInTheDocument());
  });
});
