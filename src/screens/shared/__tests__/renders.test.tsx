// A progress update of one job re-renders that job's row only: not the other rows, not the
// screen around them and never the playlist grid of the accession card.
import { act, createElement } from "react";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { pasteLink, renderApp } from "../../../app/__tests__/harness";
import { api } from "../../../ipc/commands";
import type { EnqueueRequest, Job } from "../../../ipc/types";
import { useJobs } from "../../../store/jobs";
import { useNav } from "../../../store/nav";
import type * as UiModule from "../../../ui";
import type { ThumbCellProps } from "../../../ui";
import type * as SeqModule from "../SeqFigure";

const renders = vi.hoisted(() => ({ seq: [] as number[], thumbs: 0 }));

// every ledger row draws exactly one SeqFigure: count them per accession number
vi.mock("../SeqFigure", async (importOriginal) => {
  const m = await importOriginal<typeof SeqModule>();
  return {
    SeqFigure: (p: { seq: number | null | undefined }) => {
      if (p.seq != null) renders.seq.push(p.seq);
      return m.SeqFigure(p);
    },
  };
});

vi.mock("../../../ui", async (importOriginal) => {
  const m = await importOriginal<typeof UiModule>();
  return {
    ...m,
    ThumbCell: (p: ThumbCellProps) => {
      renders.thumbs++;
      return createElement(m.ThumbCell, p);
    },
  };
});

const VIDEO = "https://www.youtube.com/watch?v=abcdef12345";
const PLAYLIST = "https://www.youtube.com/playlist?list=PLstudy02";

const req = (url: string): EnqueueRequest => ({
  url,
  presetId: "best",
  playlistItems: null,
  outputDir: null,
  videoPassword: null,
  twofactor: null,
  title: null,
  thumbnail: null,
});

function resetCounts() {
  renders.seq.length = 0;
  renders.thumbs = 0;
}

/** One progress event for `job`, as `job://update` would deliver it. */
function progress(job: Job, fraction: number) {
  act(() => {
    useJobs.getState().upsert({ ...job, stage: "downloading", progress: fraction, speed: 1000 });
  });
}

async function eightDownloads(tick: (ms?: number) => Promise<void>): Promise<Job[]> {
  for (let i = 0; i < 8; i++) await api.enqueue(req(`${VIDEO}&n=${i}`));
  await tick(0);
  const jobs = Object.values(useJobs.getState().jobs);
  expect(jobs).toHaveLength(8);
  return jobs.sort((a, b) => a.seq - b.seq);
}

describe("render isolation", () => {
  it("Recibir: one job's progress re-renders its row only, never the playlist grid", async () => {
    const { tick } = await renderApp({ settings: { language: "es", concurrency: 8 } });
    const jobs = await eightDownloads(tick);

    pasteLink(PLAYLIST);
    await tick(0);
    await screen.findByTestId("accession-card");
    expect(renders.thumbs).toBeGreaterThan(0);
    expect(screen.getAllByTestId(/^queue-item-/)).toHaveLength(8);

    const [, target] = jobs;
    resetCounts();
    progress(target, 0.4);
    progress(target, 0.5);
    expect(renders.seq).toEqual([target.seq, target.seq]);
    expect(renders.thumbs).toBe(0);

    // all eight moving at once: each row once per own event, the grid still untouched
    resetCounts();
    for (const j of jobs) progress(j, 0.6);
    expect([...renders.seq].sort((a, b) => a - b)).toEqual(jobs.map((j) => j.seq));
    expect(renders.thumbs).toBe(0);
  });

  it("Registro: one job's progress re-renders its row only (all filters)", async () => {
    const { tick } = await renderApp({ settings: { language: "es", concurrency: 8 } });
    const jobs = await eightDownloads(tick);
    act(() => useNav.getState().navigate("queue"));
    await tick(0);
    expect(screen.getAllByTestId(/^queue-item-/)).toHaveLength(8);

    const target = jobs[3];
    const totals = screen.getByTestId("queue-totals");
    const before = totals.textContent;
    resetCounts();
    act(() => {
      useJobs.getState().upsert({ ...target, stage: "downloading", speed: 123_456_789 });
    });
    expect(renders.seq).toEqual([target.seq]);
    // the live totals still follow the event
    expect(totals.textContent).not.toBe(before);
  });

  it("a row that changes stage still updates, and only that row", async () => {
    const { tick } = await renderApp({ settings: { language: "es", concurrency: 8 } });
    const jobs = await eightDownloads(tick);
    const target = jobs[0];
    resetCounts();
    act(() => {
      useJobs
        .getState()
        .upsert({ ...target, stage: "error", error: { code: "unknown", detail: "x" } });
    });
    expect(renders.seq).toEqual([target.seq]);
    expect(screen.getByTestId(`queue-item-${target.id}`)).toHaveAttribute("data-stage", "error");
  });
});
