import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EnqueueRequest } from "../../../ipc/types";
import { calls, pasteLink, renderApp } from "../../../app/__tests__/harness";

const VIDEO = "https://www.youtube.com/watch?v=abcdef12345";
const PLAYLIST = "https://www.youtube.com/playlist?list=PLstudy02";

function jobRows() {
  return screen.queryAllByTestId(/^queue-item-/);
}

describe("Recibir", () => {
  it("teaches how to start when the ledger is empty", async () => {
    await renderApp();
    expect(screen.getByText("El registro está vacío")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeDisabled();
  });

  it("paste → accession card → Ingresar → the row inks its span and is stamped ARCHIVADO", async () => {
    const { be, user, tick } = await renderApp();
    pasteLink(VIDEO);
    await tick(0);
    const card = await screen.findByTestId("accession-card");
    expect(within(card).getByRole("heading", { level: 2 })).toHaveTextContent(/\S/);
    expect(within(card).getByText("youtube")).toBeInTheDocument();
    // the preview number comes from the backend and continues from the archive
    expect(await within(card).findByTestId("next-accession")).toHaveTextContent("000026");
    expect(within(card).getByText("C:\\Users\\ana\\Videos")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ingresar" }));
    await tick(0);
    const enq = calls(be, "enqueue");
    expect(enq).toHaveLength(1);
    const req = enq[0].args!.req as EnqueueRequest;
    expect(req).toMatchObject({
      url: VIDEO,
      presetId: "best",
      playlistItems: null,
      outputDir: null,
    });
    expect(req.videoPassword).toBeNull();

    // the counter is cleared and the card filed
    await waitFor(() => expect(screen.queryByTestId("accession-card")).toBeNull());
    expect(screen.getByRole("textbox", { name: "Enlace" })).toHaveValue("");

    const [row] = jobRows();
    expect(row).toHaveAttribute("data-stage", "downloading");
    await tick(2000);
    const bar = within(row).getByRole("progressbar");
    const now = Number(bar.getAttribute("aria-valuenow"));
    expect(now).toBeGreaterThan(0);
    expect(now).toBeLessThan(100);

    await tick(40_000);
    expect(row).toHaveAttribute("data-stage", "done");
    expect(within(row).getByText("Archivado")).toBeInTheDocument();
    // a toast confirms the filing
    expect(await screen.findByText(/^Archivado: /)).toBeInTheDocument();
  });

  it("files only the selected playlist entries", async () => {
    const { be, user, tick } = await renderApp();
    pasteLink(PLAYLIST);
    await tick(0);
    const picker = await screen.findByRole("region", { name: "Entradas de la lista" });
    const boxes = within(picker).getAllByRole("checkbox");
    expect(boxes).toHaveLength(12);
    expect(screen.getByTestId("picker-count")).toHaveTextContent("12/12");

    await user.click(boxes[1]);
    await user.click(boxes[4]);
    expect(screen.getByTestId("picker-count")).toHaveTextContent("10/12");

    await user.click(screen.getByRole("button", { name: "Ingresar" }));
    await tick(0);
    const req = calls(be, "enqueue")[0].args!.req as EnqueueRequest;
    expect(req.playlistItems).toEqual([1, 3, 4, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("selects a range and none, and refuses to file an empty selection", async () => {
    const { user, tick } = await renderApp();
    pasteLink(PLAYLIST);
    await tick(0);
    await screen.findByTestId("accession-card");
    await user.click(screen.getByRole("button", { name: "Ninguna" }));
    expect(screen.getByTestId("picker-count")).toHaveTextContent("0/12");
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeDisabled();
    expect(
      screen.getByText("Elige al menos una entrada para ingresar la lista."),
    ).toBeInTheDocument();

    const from = screen.getByRole("textbox", { name: "Primera entrada del rango" });
    const to = screen.getByRole("textbox", { name: "Última entrada del rango" });
    await user.clear(from);
    await user.type(from, "3");
    await user.clear(to);
    await user.type(to, "5");
    await user.click(screen.getByRole("button", { name: "Seleccionar rango" }));
    expect(screen.getByTestId("picker-count")).toHaveTextContent("3/12");
  });

  it("whole playlist selected → playlistItems [] (everything)", async () => {
    const { be, user, tick } = await renderApp();
    pasteLink(PLAYLIST);
    await tick(0);
    await screen.findByTestId("accession-card");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));
    await tick(0);
    expect((calls(be, "enqueue")[0].args!.req as EnqueueRequest).playlistItems).toEqual([]);
  });

  it("passes one-off video password and 2FA without persisting them", async () => {
    const { be, user, tick } = await renderApp();
    pasteLink(VIDEO);
    await tick(0);
    await screen.findByTestId("accession-card");
    await user.click(screen.getByText("Opciones de esta descarga"));
    await user.type(screen.getByLabelText(/Contraseña del video/), "pw-123");
    await user.type(screen.getByLabelText(/Código de verificación/), "424242");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));
    await tick(0);
    const req = calls(be, "enqueue")[0].args!.req as EnqueueRequest;
    expect(req.videoPassword).toBe("pw-123");
    expect(req.twofactor).toBe("424242");
    expect(JSON.stringify(be.snapshot().settings)).not.toContain("pw-123");
    expect(calls(be, "settings_set").some((c) => JSON.stringify(c.args).includes("pw-123"))).toBe(
      false,
    );
  });

  it("«Tramo»: a bad range blocks Ingresar; a valid one files only that section", async () => {
    const { be, user, tick } = await renderApp();
    pasteLink(VIDEO);
    await tick(0);
    const card = await screen.findByTestId("accession-card");
    await user.click(within(card).getByText("Tramo"));
    const group = within(card).getByRole("group", { name: "Tramo" });
    const from = within(group).getByRole("textbox", { name: "Desde" });
    const to = within(group).getByRole("textbox", { name: "Hasta" });
    expect(from).toHaveAttribute("placeholder", "0:00");
    expect(to.getAttribute("placeholder")).toMatch(/^\d+:\d\d$/);
    const ingresar = screen.getByRole("button", { name: "Ingresar" });

    await user.type(from, "1:30");
    await user.type(to, "1:00");
    expect(within(group).getByText("«Hasta» tiene que ir después de «Desde».")).toBeVisible();
    expect(to).toHaveAttribute("aria-invalid", "true");
    expect(ingresar).toBeDisabled();

    await user.clear(to);
    await user.type(to, "1:6x");
    expect(within(group).getByText("Escribe segundos, m:ss o h:mm:ss.")).toBeVisible();
    await user.clear(to);
    await user.type(to, "9:59:00");
    expect(within(group).getByText(/^El video dura \d+:\d\d\.$/)).toBeVisible();
    expect(ingresar).toBeDisabled();

    await user.clear(to);
    await user.type(to, "1:45");
    expect(to).not.toHaveAttribute("aria-invalid");
    expect(ingresar).toBeEnabled();
    await user.click(ingresar);
    await tick(0);
    const req = calls(be, "enqueue")[0].args!.req as EnqueueRequest;
    expect(req.clip).toEqual({ start: 90, end: 105 });
    const [row] = jobRows();
    expect(within(row).getByTestId("job-clip")).toHaveTextContent("1:30–1:45");
    expect(within(row).getByTestId("job-clip")).toHaveAttribute("title", "Tramo 1:30–1:45");
  });

  it("«Tramo» is a disclosure: closed by default, held open while the range is invalid", async () => {
    const { user, tick } = await renderApp();
    pasteLink(VIDEO);
    await tick(0);
    await screen.findByTestId("accession-card");
    const tramo = screen.getByTestId("clip-fields");
    const summary = screen.getByTestId("clip-summary");
    expect(tramo).not.toHaveAttribute("open");
    expect(summary).toHaveTextContent(/^Tramo$/);

    await user.click(summary);
    expect(tramo).toHaveAttribute("open");
    const from = screen.getByRole("textbox", { name: "Desde" });
    const to = screen.getByRole("textbox", { name: "Hasta" });
    await user.type(from, "2:00");
    await user.type(to, "1:00");
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeDisabled();
    // the error blocks Ingresar, so it cannot be folded away
    await user.click(summary);
    expect(tramo).toHaveAttribute("open");
    expect(screen.getByText("«Hasta» tiene que ir después de «Desde».")).toBeVisible();
    expect(screen.queryByTestId("clip-summary-range")).toBeNull();

    // a valid range shows in the summary, and the disclosure folds again
    await user.clear(from);
    await user.type(from, "1:30");
    await user.clear(to);
    await user.type(to, "2:45");
    expect(screen.getByTestId("clip-summary-range")).toHaveTextContent("1:30–2:45");
    expect(summary).toHaveTextContent("Tramo · 1:30–2:45");
    await user.click(summary);
    expect(tramo).not.toHaveAttribute("open");
    expect(screen.getByTestId("clip-summary-range")).toHaveTextContent("1:30–2:45");
  });

  it("«Tramo» opens on its own when the card comes back with a range typed", async () => {
    const { user, tick } = await renderApp();
    pasteLink(VIDEO);
    await tick(0);
    await screen.findByTestId("accession-card");
    await user.click(screen.getByText("Tramo"));
    await user.type(screen.getByRole("textbox", { name: "Desde" }), "0:10");
    // leave Recibir for the catalog and come back: the counter keeps the link and the typed range
    await user.click(screen.getByTestId("nav-catalog"));
    await user.click(screen.getByTestId("nav-receive"));
    expect(await screen.findByTestId("clip-fields")).toHaveAttribute("open");
    expect(screen.getByRole("textbox", { name: "Desde" })).toHaveValue("0:10");
  });

  it("«Tramo» empty files the whole video, resets per link and is not offered for playlists", async () => {
    const { be, user, tick } = await renderApp();
    pasteLink(VIDEO);
    await tick(0);
    await screen.findByTestId("accession-card");
    await user.click(screen.getByText("Tramo"));
    await user.type(screen.getByRole("textbox", { name: "Desde" }), "5");
    // a new link starts with empty fields
    pasteLink("https://www.youtube.com/watch?v=zyxwvut9876");
    await tick(0);
    await screen.findByTestId("accession-card");
    // …and a closed «Tramo»
    expect(screen.getByTestId("clip-fields")).not.toHaveAttribute("open");
    await user.click(screen.getByText("Tramo"));
    expect(screen.getByRole("textbox", { name: "Desde" })).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));
    await tick(0);
    expect((calls(be, "enqueue")[0].args!.req as EnqueueRequest).clip).toBeNull();
    expect(screen.queryByTestId("job-clip")).toBeNull();

    pasteLink(PLAYLIST);
    await tick(0);
    await screen.findByRole("region", { name: "Entradas de la lista" });
    expect(screen.queryByTestId("clip-fields")).toBeNull();
  });

  it("asks for a folder when settings.askEachTime is on", async () => {
    const { be, user, tick } = await renderApp({ settings: { language: "es", askEachTime: true } });
    pasteLink(VIDEO);
    await tick(0);
    await screen.findByTestId("accession-card");
    expect(screen.getByText("Se pregunta al ingresar")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ingresar" }));
    await tick(0);
    await waitFor(() => expect(calls(be, "enqueue")).toHaveLength(1));
    expect(calls(be, "plugin:dialog|open")).toHaveLength(1);
    expect((calls(be, "enqueue")[0].args!.req as EnqueueRequest).outputDir).toMatch(/ymd$/);
  });

  it("switching to Audio offers only audio presets with translated names", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("radio", { name: "Audio" }));
    const select = screen.getByRole("combobox", { name: "Preajuste" });
    const labels = within(select)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(labels).toEqual(["MP3 320 kbps", "M4A (AAC)", "Audio original"]);
  });

  it("shows a translated probe error with retry", async () => {
    const { user, tick } = await renderApp();
    pasteLink("https://www.youtube.com/watch?v=notfound000");
    await tick(0);
    expect(await screen.findByText("El video ya no está disponible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Borrar enlace" }));
    expect(screen.queryByText("El video ya no está disponible")).toBeNull();
  });
});

describe("error rows", () => {
  async function failed(url: string) {
    const h = await renderApp();
    const input = screen.getByRole("textbox", { name: "Enlace" });
    await h.user.type(input, `${url}{Enter}`);
    await h.tick(0);
    await h.tick(300);
    const [row] = jobRows();
    expect(row).toHaveAttribute("data-stage", "error");
    return h;
  }

  it("bot check → translated next step and a button that opens Ajustes → Cuentas", async () => {
    const { user, tick } = await failed("https://www.youtube.com/watch?v=botcheck123");
    expect(screen.getByText("YouTube pide confirmar que no eres un bot")).toBeInTheDocument();
    expect(screen.getByText(/Activa las cookies de tu navegador/)).toBeInTheDocument();
    expect(screen.getByText(/Sign in to confirm you/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Abrir Ajustes → Cuentas" }));
    await tick(0);
    expect(screen.getByRole("heading", { level: 1, name: "Ajustes" })).toBeInTheDocument();
    expect(screen.getByTestId("settings-tab-accounts")).toHaveAttribute("aria-current", "page");
  });

  it("ffmpeg missing → button installs ffmpeg from Dependencias", async () => {
    const { be, user, tick } = await failed("https://www.youtube.com/watch?v=nofmt000001");
    expect(screen.getByText("Falta ffmpeg")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Instalar ffmpeg" }));
    await tick(0);
    expect(screen.getByRole("heading", { level: 1, name: "Dependencias" })).toBeInTheDocument();
    expect(calls(be, "deps_install").map((c) => c.args!.id)).toEqual(["ffmpeg"]);
  });

  it("retry re-queues the job and the detail can be collapsed", async () => {
    const { be, user, tick } = await failed("https://www.youtube.com/watch?v=private0001");
    await user.click(screen.getByRole("button", { name: "Ocultar el detalle del error" }));
    expect(screen.queryByText("El video es privado")).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Reintentar Tutorial|^Reintentar / }));
    await tick(0);
    expect(calls(be, "job_retry")).toHaveLength(1);
  });

  it("cancel and remove act on the row", async () => {
    const { be, user, tick } = await renderApp();
    await user.type(screen.getByRole("textbox", { name: "Enlace" }), `${VIDEO}{Enter}`);
    await tick(0);
    const [row] = jobRows();
    await user.click(within(row).getByRole("button", { name: /^Cancelar / }));
    await tick(0);
    expect(row).toHaveAttribute("data-stage", "canceled");
    await user.click(within(row).getByRole("button", { name: /^Quitar / }));
    await tick(0);
    expect(jobRows()).toHaveLength(0);
    expect(calls(be, "job_remove")).toHaveLength(1);
  });
});
