import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EnqueueRequest } from "../../../ipc/types";
import { calls, renderApp } from "../../../app/__tests__/harness";
import { useReceive } from "../../../store/receive";
import { URL_INPUT_ID } from "../ingest";

const A = "https://www.youtube.com/watch?v=batchAAAA01";
const B = "https://vimeo.com/123456789";
const LIST = "https://www.youtube.com/playlist?list=PLbatch0001";
const MANY = `${A}\n${B}\n  ${LIST}\n${A}\nnot-a-link ftp://x.org/file`;

function field() {
  return document.getElementById(URL_INPUT_ID) as HTMLInputElement;
}

/** Paste into the counter whatever the UI language. */
function paste(text: string) {
  fireEvent.paste(field(), { clipboardData: { getData: () => text } });
}

function enqueued(be: Parameters<typeof calls>[0]) {
  return calls(be, "enqueue").map((c) => c.args!.req as EnqueueRequest);
}

describe("Recibir: several links at once", () => {
  it("one link keeps the usual flow: the field is filled and probed", async () => {
    const { be, tick } = await renderApp();
    paste(`  ${A}\n`);
    await tick(0);
    expect(field()).toHaveValue(A);
    expect(await screen.findByTestId("accession-card")).toBeInTheDocument();
    expect(screen.queryByTestId("batch-panel")).toBeNull();
    expect(calls(be, "probe")).toHaveLength(1);
  });

  it("a paste with several links opens the panel without touching the field", async () => {
    const { be, tick } = await renderApp();
    paste(MANY);
    await tick(0);
    const panel = screen.getByTestId("batch-panel");
    expect(field()).toHaveValue("");
    expect(calls(be, "probe")).toHaveLength(0);
    expect(within(panel).getByRole("heading", { level: 2 })).toHaveTextContent("3 enlaces");
    const links = within(panel).getAllByTestId("batch-link");
    expect(links.map((l) => l.textContent)).toEqual([`01${A}`, `02${B}`, `03${LIST}`]);
    expect(within(panel).getAllByTestId("batch-excluded")).toHaveLength(2);
    expect(
      within(panel).getByText("2 textos pegados no son enlaces descargables y se dejan fuera."),
    ).toBeInTheDocument();
    expect(within(panel).getByText("C:\\Users\\ana\\Videos")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Encolar 3" })).toBeEnabled();
  });

  it("Encolar N files every link with the chosen preset as single videos", async () => {
    const { be, user, tick } = await renderApp();
    await user.selectOptions(screen.getByRole("combobox", { name: "Preajuste" }), "mp4-720");
    paste(MANY);
    await tick(0);
    await user.click(screen.getByRole("button", { name: "Encolar 3" }));
    await tick(0);
    await waitFor(() => expect(enqueued(be)).toHaveLength(3));
    expect(enqueued(be)).toEqual(
      [A, B, LIST].map((url) => ({
        url,
        presetId: "mp4-720",
        playlistItems: null,
        outputDir: null,
        videoPassword: null,
        twofactor: null,
        clip: null,
        title: null,
        thumbnail: null,
      })),
    );
    // summary toast, panel gone, the counter is ready for the next link
    expect(await screen.findByText("3 enlaces en cola")).toBeInTheDocument();
    expect(screen.queryByTestId("batch-panel")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(field()));
    expect(screen.getAllByTestId(/^queue-item-/)).toHaveLength(3);
  });

  it("Playlists completas on → playlistItems [] for every link", async () => {
    const { be, user, tick } = await renderApp();
    paste(`${A} ${LIST}`);
    await tick(0);
    await user.click(screen.getByRole("switch", { name: /Playlists completas/ }));
    await user.click(screen.getByRole("button", { name: "Encolar 2" }));
    await tick(0);
    await waitFor(() => expect(enqueued(be)).toHaveLength(2));
    expect(enqueued(be).map((r) => r.playlistItems)).toEqual([[], []]);
  });

  it("asks for the folder once for the whole batch", async () => {
    const { be, user, tick } = await renderApp({ settings: { language: "es", askEachTime: true } });
    paste(`${A}\n${B}\n${LIST}`);
    await tick(0);
    expect(screen.getByText("Se pregunta una vez para todos")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Encolar 3" }));
    await tick(0);
    await waitFor(() => expect(enqueued(be)).toHaveLength(3));
    expect(calls(be, "plugin:dialog|open")).toHaveLength(1);
    for (const req of enqueued(be)) expect(req.outputDir).toMatch(/ymd$/);
  });

  it("Enter files the batch and Esc drops it", async () => {
    const { be, user, tick } = await renderApp();
    paste(`${A}\n${B}`);
    await tick(0);
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("batch-panel")).toBeNull();
    expect(enqueued(be)).toHaveLength(0);
    await waitFor(() => expect(document.activeElement).toBe(field()));

    paste(`${A}\n${B}`);
    await tick(0);
    // focus is in the (empty) counter field: Enter submits the batch
    field().focus();
    await user.keyboard("{Enter}");
    await tick(0);
    await waitFor(() => expect(enqueued(be)).toHaveLength(2));

    // and from outside the form too
    paste(`${B}\n${LIST}`);
    await tick(0);
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key: "Enter" });
    await tick(0);
    await waitFor(() => expect(enqueued(be)).toHaveLength(4));
  });

  it("Cancelar leaves the counter empty and files nothing", async () => {
    const { be, user, tick } = await renderApp();
    paste(`${A}\n${B}`);
    await tick(0);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByTestId("batch-panel")).toBeNull();
    expect(useReceive.getState().batch).toBeNull();
    expect(enqueued(be)).toHaveLength(0);
  });

  it("a single link pasted afterwards replaces the batch", async () => {
    const { tick } = await renderApp();
    paste(`${A}\n${B}`);
    await tick(0);
    paste(B);
    await tick(0);
    expect(await screen.findByTestId("accession-card")).toBeInTheDocument();
    expect(screen.queryByTestId("batch-panel")).toBeNull();
  });

  it("speaks English", async () => {
    const { user, tick } = await renderApp({ settings: { language: "en" } });
    paste(`${A}\n${B}\nnope`);
    await tick(0);
    const panel = await screen.findByTestId("batch-panel");
    expect(within(panel).getByRole("heading", { level: 2 })).toHaveTextContent("2 links");
    expect(
      within(panel).getByText("1 pasted item is not a downloadable link and is left out."),
    ).toBeInTheDocument();
    expect(within(panel).getByRole("switch", { name: /Whole playlists/ })).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Queue 2" }));
    await tick(0);
    expect(await screen.findByText("2 links queued")).toBeInTheDocument();
  });
});
