import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { calls, renderApp } from "../../../app/__tests__/harness";
import { api } from "../../../ipc/commands";
import type { EnqueueRequest } from "../../../ipc/types";
import { useNav } from "../../../store/nav";

const req = (url: string, extra: Partial<EnqueueRequest> = {}): EnqueueRequest => ({
  url,
  presetId: "best",
  playlistItems: null,
  outputDir: null,
  videoPassword: null,
  twofactor: null,
  title: null,
  thumbnail: null,
  ...extra,
});

/** Two resumable downloads and one with a video password, then ymd "restarts". */
async function restartWithPending() {
  const h = await renderApp({ settings: { language: "es", concurrency: 1 } });
  const a = await act(() =>
    api.enqueue(req("https://www.youtube.com/watch?v=aaa", { title: "Uno" })),
  );
  const b = await act(() =>
    api.enqueue(req("https://www.youtube.com/watch?v=bbb", { title: "Dos" })),
  );
  const c = await act(() =>
    api.enqueue(
      req("https://vimeo.com/123", { title: "Con clave", videoPassword: "placeholder-pw" }),
    ),
  );
  await h.tick(500);
  act(() => {
    h.be.simulateRestart();
  });
  act(() => useNav.getState().navigate("queue"));
  await h.tick(0);
  return { ...h, a, b, c };
}

describe("Registro: descargas sin terminar", () => {
  it("shows nothing when there is nothing pending", async () => {
    await renderApp({ route: "queue" });
    expect(screen.queryByTestId("queue-pending")).toBeNull();
  });

  it("offers to resume them; resumed rows keep their number and run again", async () => {
    const { be, tick, user, a, b } = await restartWithPending();
    const box = await screen.findByTestId("queue-pending");
    expect(within(box).getByText("Hay 2 descargas sin terminar")).toBeInTheDocument();
    expect(within(box).getByText("Uno")).toBeInTheDocument();
    expect(within(box).getByText("Dos")).toBeInTheDocument();
    expect(
      within(box).getByText("1 descarga necesita la contraseña o el código"),
    ).toBeInTheDocument();
    expect(
      within(box).getByText("Vuelve a pegarlas en Recibir: necesitan la contraseña o el código."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId(`queue-item-${a.id}`)).toBeNull();

    await user.click(within(box).getByRole("button", { name: "Reanudar" }));
    await tick(0);
    const resumes = calls(be, "jobs_resume");
    expect(resumes[resumes.length - 1]?.args).toEqual({ ids: [a.id, b.id] });
    await waitFor(() => expect(screen.getByTestId(`queue-item-${a.id}`)).toBeInTheDocument());
    expect(screen.getByTestId(`queue-item-${b.id}`)).toBeInTheDocument();
    // only the one needing its password is left
    await waitFor(() => expect(screen.queryByText("Hay 2 descargas sin terminar")).toBeNull());
    expect(screen.getByText("1 descarga necesita la contraseña o el código")).toBeInTheDocument();

    await tick(120_000);
    await waitFor(() => expect(be.snapshot().jobs.find((j) => j.id === a.id)?.stage).toBe("done"));
    expect(be.snapshot().jobs.find((j) => j.id === a.id)?.seq).toBe(a.seq);
  });

  it("discards them, the password ones apart", async () => {
    const { be, tick, user, c } = await restartWithPending();
    const box = await screen.findByTestId("queue-pending");
    const [discardReady, discardLocked] = within(box).getAllByRole("button", {
      name: "Descartar",
    });
    await user.click(discardReady);
    await tick(0);
    await waitFor(() => expect(screen.queryByText("Hay 2 descargas sin terminar")).toBeNull());
    expect(be.snapshot().pending.map((p) => p.id)).toEqual([c.id]);

    await user.click(discardLocked);
    await tick(0);
    await waitFor(() => expect(screen.queryByTestId("queue-pending")).toBeNull());
    expect(be.snapshot().pending).toEqual([]);
    expect(calls(be, "jobs_resume")).toHaveLength(0);
  });
});
