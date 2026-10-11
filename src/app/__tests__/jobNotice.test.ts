import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupI18n } from "../../i18n";
import type { Job, JobStage } from "../../ipc/types";
import { createJobNotice, GROUP_MS, jobNoticeText, type JobNoticeDeps } from "../jobNotice";

function job(id: string, stage: JobStage, over: Partial<Job> = {}): Job {
  return {
    id,
    seq: 1,
    url: `https://example.com/${id}`,
    title: `Video ${id}`,
    thumbnail: null,
    presetId: "best",
    kind: "video",
    stage,
    progress: 0,
    downloadedBytes: null,
    totalBytes: null,
    speed: null,
    eta: null,
    outputDir: "/out",
    filepath: null,
    error: stage === "error" ? { code: "private", detail: "ERROR: private" } : null,
    playlistIndex: null,
    playlistCount: null,
    createdAt: "2026-10-01T00:00:00Z",
    finishedAt: null,
    ...over,
  };
}

/** The transition from running to `stage`. */
function end(n: ReturnType<typeof createJobNotice>, id: string, stage: JobStage, over = {}) {
  n.onJob(job(id, stage, over), job(id, "downloading"));
}

function deps(over: Partial<JobNoticeDeps> = {}) {
  const base = {
    focused: vi.fn(() => false),
    enabled: vi.fn(() => true),
    notify: vi.fn(async (_title: string, _body: string) => {}),
    goToQueue: vi.fn(),
  };
  return { ...base, ...over } as typeof base;
}

describe("job notice", () => {
  beforeEach(() => {
    setupI18n("es");
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("in the background, one finished download says its title", async () => {
    const d = deps();
    const n = createJobNotice(d);
    end(n, "a", "done");
    expect(d.notify).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(GROUP_MS);
    expect(d.notify).toHaveBeenCalledTimes(1);
    expect(d.notify).toHaveBeenCalledWith("Descarga terminada", "Video a");
  });

  it("stays quiet while the window is focused, with the setting off, or without a transition", async () => {
    const focused = deps({ focused: vi.fn(() => true) });
    let n = createJobNotice(focused);
    end(n, "a", "done");
    await vi.advanceTimersByTimeAsync(GROUP_MS * 2);
    expect(focused.notify).not.toHaveBeenCalled();

    const off = deps({ enabled: vi.fn(() => false) });
    n = createJobNotice(off);
    end(n, "a", "error");
    await vi.advanceTimersByTimeAsync(GROUP_MS * 2);
    expect(off.notify).not.toHaveBeenCalled();

    const d = deps();
    n = createJobNotice(d);
    n.onJob(job("a", "done"), undefined); // first sight (e.g. the list loading)
    n.onJob(job("b", "done"), job("b", "done")); // repeated update
    n.onJob(job("c", "canceled"), job("c", "downloading"));
    n.onJob(job("d", "merging"), job("d", "downloading"));
    await vi.advanceTimersByTimeAsync(GROUP_MS * 2);
    expect(d.notify).not.toHaveBeenCalled();
  });

  it("drops the batch when the window got focus before it was sent", async () => {
    let focused = false;
    const d = deps({ focused: vi.fn(() => focused) });
    const n = createJobNotice(d);
    end(n, "a", "done");
    focused = true;
    await vi.advanceTimersByTimeAsync(GROUP_MS);
    expect(d.notify).not.toHaveBeenCalled();
  });

  it("groups downloads that end within the window into one notification", async () => {
    const d = deps();
    const n = createJobNotice(d);
    end(n, "a", "done");
    await vi.advanceTimersByTimeAsync(500);
    end(n, "b", "done");
    end(n, "c", "done");
    await vi.advanceTimersByTimeAsync(GROUP_MS);
    expect(d.notify).toHaveBeenCalledTimes(1);
    expect(d.notify).toHaveBeenCalledWith("3 descargas terminadas", "Video a · Video b · Video c");

    // a later one starts a new batch
    end(n, "d", "done");
    await vi.advanceTimersByTimeAsync(GROUP_MS);
    expect(d.notify).toHaveBeenCalledTimes(2);
    expect(d.notify.mock.calls[1]).toEqual(["Descarga terminada", "Video d"]);
  });

  it("mentions failures in a group", async () => {
    const d = deps();
    const n = createJobNotice(d);
    end(n, "a", "done");
    end(n, "b", "error");
    end(n, "c", "error");
    await vi.advanceTimersByTimeAsync(GROUP_MS);
    expect(d.notify).toHaveBeenCalledWith(
      "3 descargas terminaron: 2 con error",
      "Abre ymd para ver qué falló en el Registro.",
    );
  });

  it("a failure names the video and the error, then focus opens the Registro once", async () => {
    const d = deps();
    const n = createJobNotice(d);
    n.onFocus();
    expect(d.goToQueue).not.toHaveBeenCalled();

    end(n, "a", "error", { title: null, url: "https://x.test/v" });
    await vi.advanceTimersByTimeAsync(GROUP_MS);
    expect(d.notify).toHaveBeenCalledWith(
      "No se pudo descargar «https://x.test/v»",
      "El video es privado",
    );
    n.onFocus();
    n.onFocus();
    expect(d.goToQueue).toHaveBeenCalledTimes(1);

    // a success alone does not move the person around
    end(n, "b", "done");
    await vi.advanceTimersByTimeAsync(GROUP_MS);
    n.onFocus();
    expect(d.goToQueue).toHaveBeenCalledTimes(1);
  });

  it("survives a failing notifier and dispose cancels a pending batch", async () => {
    const d = deps({
      notify: vi.fn(async () => {
        throw new Error("denied");
      }),
    });
    const n = createJobNotice(d);
    end(n, "a", "done");
    await vi.advanceTimersByTimeAsync(GROUP_MS);
    expect(d.notify).toHaveBeenCalledTimes(1);

    end(n, "b", "done");
    n.dispose();
    await vi.advanceTimersByTimeAsync(GROUP_MS * 2);
    expect(d.notify).toHaveBeenCalledTimes(1);
  });

  it("speaks English too", () => {
    setupI18n("en");
    expect(jobNoticeText([job("a", "done")])).toEqual({
      title: "Download finished",
      body: "Video a",
    });
    expect(jobNoticeText([job("a", "error")]).title).toBe("Couldn’t download “Video a”");
    expect(jobNoticeText([job("a", "done"), job("b", "error")]).title).toBe(
      "2 downloads ended: 1 failed",
    );
    setupI18n("es");
  });
});
