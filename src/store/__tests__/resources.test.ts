// Long-running hygiene of the stores: nothing kept for rows that are gone, no half-connected
// event subscriptions, and little work while ymd sits hidden in the tray.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJobNotice } from "../../app/jobNotice";
import { setupI18n } from "../../i18n";
import { api } from "../../ipc/commands";
import { events } from "../../ipc/events";
import { flushMicrotasks, installMockBackend } from "../../ipc/mock";
import type { EnqueueRequest, Job } from "../../ipc/types";
import { connectDeps, resetDepsStore } from "../deps";
import { FLUSH_HIDDEN_MS, connectJobs, onJobChange, resetJobsStore, useJobs } from "../jobs";
import { settleListeners } from "../listen";

const req: EnqueueRequest = {
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  presetId: "mp4-1080",
  playlistItems: null,
  outputDir: null,
  videoPassword: null,
  twofactor: null,
  title: null,
  thumbnail: null,
};

const job = (p: Partial<Job>): Job => ({
  id: "j",
  seq: 1,
  url: "https://example.com/j",
  title: "J",
  thumbnail: null,
  presetId: "best",
  kind: "video",
  stage: "downloading",
  progress: 0,
  downloadedBytes: null,
  totalBytes: null,
  speed: null,
  eta: null,
  outputDir: "",
  filepath: null,
  error: null,
  playlistIndex: null,
  playlistCount: null,
  createdAt: "",
  finishedAt: null,
  ...p,
});

const failure = { code: "unknown", detail: "boom" } as const;

function hidden(on = true) {
  return vi.spyOn(document, "visibilityState", "get").mockReturnValue(on ? "hidden" : "visible");
}

beforeEach(() => {
  resetJobsStore();
  resetDepsStore();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  resetJobsStore();
});

describe("jobs store — action errors follow their row", () => {
  it("drop() forgets the row's last action error", () => {
    useJobs.setState({ jobs: { a: job({ id: "a" }) }, actionErrors: { a: failure } });
    useJobs.getState().drop("a");
    expect(useJobs.getState().jobs).toEqual({});
    expect(useJobs.getState().actionErrors).toEqual({});
  });

  it("job://removed and clearFinished drop the action errors too", async () => {
    const be = installMockBackend({ clock: "manual" });
    const off = await connectJobs();
    const a = await useJobs.getState().enqueue(req);
    const b = await useJobs.getState().enqueue(req);
    await api.jobCancel(a.id);
    await api.jobCancel(b.id);
    await be.manualClock.advanceAsync(0);
    useJobs.setState({ actionErrors: { [a.id]: failure, [b.id]: failure } });

    // removed by someone else (another window, eviction): the event drops the row
    await api.jobRemove(a.id);
    await be.manualClock.advanceAsync(0);
    expect(useJobs.getState().jobs[a.id]).toBeUndefined();
    expect(useJobs.getState().actionErrors[a.id]).toBeUndefined();

    await useJobs.getState().clearFinished();
    expect(useJobs.getState().jobs[b.id]).toBeUndefined();
    expect(useJobs.getState().actionErrors).toEqual({});
    off();
  });
});

describe("event subscriptions are all or nothing", () => {
  it("settleListeners undoes the subscriptions that worked when one failed", async () => {
    const offA = vi.fn();
    const offB = vi.fn();
    await expect(
      settleListeners([
        Promise.resolve(offA),
        Promise.reject(new Error("no ipc")),
        Promise.resolve(offB),
      ]),
    ).rejects.toThrow("no ipc");
    expect(offA).toHaveBeenCalledTimes(1);
    expect(offB).toHaveBeenCalledTimes(1);

    const ok = await settleListeners([Promise.resolve(offA)]);
    expect(ok).toEqual([offA]);
  });

  it("connectJobs rejects and unlistens the rest when a listen() fails", async () => {
    installMockBackend({ clock: "manual" });
    const offUpdate = vi.fn();
    const offRemoved = vi.fn();
    vi.spyOn(events, "onJobUpdate").mockResolvedValue(offUpdate);
    vi.spyOn(events, "onJobRemoved").mockResolvedValue(offRemoved);
    vi.spyOn(events, "onQueueSchedule").mockRejectedValue(new Error("listen failed"));
    await expect(connectJobs()).rejects.toThrow("listen failed");
    expect(offUpdate).toHaveBeenCalledTimes(1);
    expect(offRemoved).toHaveBeenCalledTimes(1);
  });

  it("connectDeps rejects and unlistens the rest when a listen() fails", async () => {
    installMockBackend({ clock: "manual" });
    const offProgress = vi.fn();
    vi.spyOn(events, "onDepsProgress").mockResolvedValue(offProgress);
    vi.spyOn(events, "onDepsChanged").mockRejectedValue(new Error("listen failed"));
    await expect(connectDeps()).rejects.toThrow("listen failed");
    expect(offProgress).toHaveBeenCalledTimes(1);
  });
});

describe("jobs store — progress while hidden", () => {
  it("visible: every update is applied at once", () => {
    useJobs.getState().upsert(job({ progress: 0.1 }));
    useJobs.getState().upsert(job({ progress: 0.2 }));
    expect(useJobs.getState().jobs.j.progress).toBe(0.2);
  });

  it("hidden: progress waits and only the newest per job lands, on a timer or when shown", async () => {
    installMockBackend({ clock: "manual" });
    const off = await connectJobs();
    vi.useFakeTimers();
    useJobs.getState().upsert(job({ progress: 0.1 }));
    const vis = hidden();
    const seen: number[] = [];
    onJobChange((j) => seen.push(j.progress));
    let renders = 0;
    const unsub = useJobs.subscribe(() => renders++);

    for (let i = 2; i <= 9; i++) useJobs.getState().upsert(job({ progress: i / 10 }));
    expect(useJobs.getState().jobs.j.progress).toBe(0.1);
    expect(renders).toBe(0);

    vi.advanceTimersByTime(FLUSH_HIDDEN_MS);
    expect(useJobs.getState().jobs.j.progress).toBe(0.9);
    expect(renders).toBe(1);
    expect(seen).toEqual([0.9]);

    // shown again: what is buffered is applied right away
    useJobs.getState().upsert(job({ progress: 0.95 }));
    vis.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(useJobs.getState().jobs.j.progress).toBe(0.95);
    unsub();

    // disconnecting applies whatever is still waiting
    vis.mockReturnValue("hidden");
    useJobs.getState().upsert(job({ progress: 0.97 }));
    off();
    expect(useJobs.getState().jobs.j.progress).toBe(0.97);
  });

  it("hidden: a stage change or a terminal state is applied at once and notifies", async () => {
    vi.useFakeTimers();
    setupI18n("es");
    useJobs.getState().upsert(job({ progress: 0.1 }));
    hidden();
    const notify = vi.fn(async (_title: string, _body: string) => {});
    const notice = createJobNotice({
      focused: () => false,
      enabled: () => true,
      notify,
      goToQueue: () => {},
    });
    const off = onJobChange(notice.onJob);

    useJobs.getState().upsert(job({ progress: 0.5 })); // buffered
    useJobs.getState().upsert(job({ stage: "merging", progress: 1 }));
    expect(useJobs.getState().jobs.j.stage).toBe("merging");
    useJobs.getState().upsert(job({ stage: "done", progress: 1, title: "Clip" }));
    expect(useJobs.getState().jobs.j.stage).toBe("done");

    // the stale buffered progress never overwrites the finished row
    vi.advanceTimersByTime(FLUSH_HIDDEN_MS * 2);
    await flushMicrotasks();
    expect(useJobs.getState().jobs.j.stage).toBe("done");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][1]).toBe("Clip");
    off();
    notice.dispose();
  });

  it("a row removed while its progress waits is not brought back", () => {
    vi.useFakeTimers();
    useJobs.getState().upsert(job({ progress: 0.1 }));
    hidden();
    useJobs.getState().upsert(job({ progress: 0.5 }));
    useJobs.getState().drop("j");
    vi.advanceTimersByTime(FLUSH_HIDDEN_MS);
    expect(useJobs.getState().jobs).toEqual({});
  });
});
