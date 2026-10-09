import { describe, expect, it, vi } from "vitest";
import { api } from "../../commands";
import { events } from "../../events";
import type { EnqueueRequest, Job } from "../../types";
import { installMockBackend, type MockBackendOptions } from "..";

const VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const PLAYLIST = "https://www.youtube.com/playlist?list=PLabc123";

function req(
  url: string,
  presetId = "mp4-1080",
  extra: Partial<EnqueueRequest> = {},
): EnqueueRequest {
  return {
    url,
    presetId,
    playlistItems: null,
    outputDir: null,
    videoPassword: null,
    twofactor: null,
    title: null,
    thumbnail: null,
    ...extra,
  };
}

function setup(opts: MockBackendOptions = {}) {
  const be = installMockBackend({ clock: "manual", ...opts });
  const updates: Job[] = [];
  const removed: string[] = [];
  return {
    be,
    clock: be.manualClock,
    updates,
    removed,
    async listen() {
      await events.onJobUpdate((j) => updates.push(j));
      await events.onJobRemoved((id) => removed.push(id));
    },
  };
}

describe("mock backend — jobs", () => {
  it("video job goes queued → downloading → merging → done and lands in history", async () => {
    const t = setup();
    await t.listen();
    const next = await api.jobsNextSeq();
    const job = await api.enqueue(req(VIDEO));
    // accession numbers continue from the archive
    expect(job.seq).toBe(next);
    expect(next).toBe(Math.max(...t.be.snapshot().history.map((h) => h.seq ?? 0)) + 1);
    expect(await api.jobsNextSeq()).toBe(next + 1);
    expect(job.kind).toBe("video");
    expect(job.outputDir).toBe("C:\\Users\\ana\\Videos");

    await t.clock.advanceAsync(60_000, 250);

    const stages = [...new Set(t.updates.filter((u) => u.id === job.id).map((u) => u.stage))];
    expect(stages).toEqual(["queued", "downloading", "merging", "done"]);

    const downloading = t.updates.filter((u) => u.stage === "downloading" && u.speed !== null);
    expect(downloading.length).toBeGreaterThan(4);
    for (const u of downloading) {
      expect(u.speed).toBeGreaterThan(1_000_000);
      expect(u.eta).toBeGreaterThanOrEqual(0);
      expect(u.downloadedBytes).toBeLessThanOrEqual(u.totalBytes!);
    }
    const progress = downloading.map((u) => u.progress);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);

    const [done] = await api.jobsList();
    expect(done.stage).toBe("done");
    expect(done.progress).toBe(1);
    expect(done.filepath).toMatch(/^C:\\Users\\ana\\Videos\\.+\.mp4$/);
    expect(done.finishedAt).not.toBeNull();

    const page = await api.historyQuery({ search: null, kind: null, limit: 1, offset: 0 });
    expect(page.items[0].filepath).toBe(done.filepath);
  });

  it("emits updates at ~4 Hz while downloading", async () => {
    const t = setup();
    await t.listen();
    await api.enqueue(req(VIDEO));
    await t.clock.advanceAsync(2000, 250);
    const ticks = t.updates.filter((u) => u.stage === "downloading" && u.speed !== null);
    expect(ticks.length).toBe(8);
  });

  it("audio job uses postprocessing instead of merging", async () => {
    const t = setup();
    await t.listen();
    const job = await api.enqueue(req(VIDEO, "mp3-320"));
    expect(job.outputDir).toBe("C:\\Users\\ana\\Music");
    await t.clock.advanceAsync(60_000, 250);
    const stages = [...new Set(t.updates.map((u) => u.stage))];
    expect(stages).toEqual(["queued", "downloading", "postprocessing", "done"]);
    const [done] = await api.jobsList();
    expect(done.filepath).toMatch(/\.mp3$/);
  });

  it.each([
    ["https://www.youtube.com/watch?v=bot123", "bot_check"],
    ["https://www.youtube.com/watch?v=private1", "private"],
  ] as const)("%s fails with %s", async (url, code) => {
    const t = setup();
    const job = await api.enqueue(req(url));
    await t.clock.advanceAsync(2000, 250);
    const [failed] = await api.jobsList();
    expect(failed.id).toBe(job.id);
    expect(failed.stage).toBe("error");
    expect(failed.error?.code).toBe(code);
    expect(failed.error?.detail).toMatch(/ERROR/);
  });

  it("cancel stops a running job, retry re-queues it, remove/clear emit job://removed", async () => {
    const t = setup();
    await t.listen();
    const a = await api.enqueue(req(VIDEO));
    await t.clock.advanceAsync(1000, 250);
    await api.jobCancel(a.id);
    let [job] = await api.jobsList();
    expect(job.stage).toBe("canceled");
    expect(job.speed).toBeNull();

    const n = t.updates.length;
    await t.clock.advanceAsync(5000, 250);
    expect(t.updates.length).toBe(n); // no more ticks after cancel

    const retried = await api.jobRetry(a.id);
    expect(retried.stage).toBe("queued");
    [job] = await api.jobsList();
    expect(job.stage).toBe("downloading");

    await expect(api.jobRemove(a.id)).rejects.toMatchObject({ code: "unknown" });
    await api.jobCancel(a.id);
    await api.jobRemove(a.id);
    expect(t.removed).toEqual([a.id]);
    expect(await api.jobsList()).toEqual([]);

    const b = await api.enqueue(req("https://www.youtube.com/watch?v=bot1"));
    const c = await api.enqueue(req(VIDEO, "mp3-320"));
    await t.clock.advanceAsync(1000, 250);
    expect(await api.jobsClearFinished()).toEqual([b.id]);
    expect((await api.jobsList()).map((j) => j.id)).toEqual([c.id]);
  });

  it("retry is rejected for jobs that are not finished; unknown ids reject", async () => {
    const t = setup();
    const a = await api.enqueue(req(VIDEO));
    await expect(api.jobRetry(a.id)).rejects.toMatchObject({ code: "unknown" });
    await expect(api.jobCancel("nope")).rejects.toMatchObject({ code: "unknown" });
    t.be.dispose();
  });

  it("respects settings.concurrency and starts queued jobs when a slot frees", async () => {
    const t = setup({ settings: { concurrency: 2 } as MockBackendOptions["settings"] });
    for (let i = 0; i < 4; i++) await api.enqueue(req(`${VIDEO}&i=${i}`));
    await t.clock.advanceAsync(300, 100);
    let stages = (await api.jobsList()).map((j) => j.stage);
    expect(stages).toEqual(["downloading", "downloading", "queued", "queued"]);

    const [first] = await api.jobsList();
    await api.jobCancel(first.id);
    stages = (await api.jobsList()).map((j) => j.stage);
    expect(stages).toEqual(["canceled", "downloading", "downloading", "queued"]);
  });

  it("playlist job walks through the selected entries", async () => {
    const t = setup();
    await t.listen();
    const probe = await api.probe(PLAYLIST);
    expect(probe.kind).toBe("playlist");
    expect(probe.entries).toHaveLength(12);
    const job = await api.enqueue(req(PLAYLIST, "mp3-320", { playlistItems: [2, 5, 7] }));
    expect(job.playlistCount).toBe(3);
    await t.clock.advanceAsync(120_000, 250);
    const indexes = new Set(t.updates.map((u) => u.playlistIndex));
    expect(indexes).toEqual(new Set([1, 2, 3]));
    const page = await api.historyQuery({ search: null, kind: "audio", limit: 3, offset: 0 });
    expect(page.items.map((i) => i.title).sort()).toEqual(
      [probe.entries[1].title, probe.entries[4].title, probe.entries[6].title].sort(),
    );
  });

  it("enqueue validates the preset and requires yt-dlp", async () => {
    setup();
    await expect(api.enqueue(req(VIDEO, "missing"))).rejects.toMatchObject({ code: "unknown" });
    installMockBackend({ clock: "manual", scenario: "first-run" });
    await expect(api.enqueue(req(VIDEO))).rejects.toMatchObject({ code: "binary_missing" });
  });

  it("works with vi fake timers and the real clock (speed factor)", async () => {
    vi.useFakeTimers();
    installMockBackend({ speed: 10 });
    await api.enqueue(req(VIDEO, "mp3-320"));
    await vi.advanceTimersByTimeAsync(10_000);
    const [job] = await api.jobsList();
    expect(job.stage).toBe("done");
  });
});

describe("mock backend — probe", () => {
  it("returns a realistic video with an offline thumbnail", async () => {
    setup();
    const p = await api.probe(`  ${VIDEO}  `);
    expect(p.kind).toBe("video");
    expect(p.id).toBe("dQw4w9WgXcQ");
    expect(p.title.length).toBeGreaterThan(5);
    expect(p.uploader).toBeTruthy();
    expect(p.duration).toBeGreaterThan(0);
    expect(p.thumbnail).toMatch(/^data:image\/svg\+xml/);
    expect(p.formats.length).toBeGreaterThan(2);
    expect(p.maxHeight).toBeGreaterThanOrEqual(720);
  });

  it("is deterministic per URL", async () => {
    setup();
    expect(await api.probe(VIDEO)).toEqual(await api.probe(VIDEO));
  });

  it.each([
    ["not a url", "unsupported_url"],
    ["https://www.youtube.com/watch?v=notfound", "unavailable"],
    ["https://offline.example.com/x", "network"],
  ] as const)("%s rejects with %s", async (url, code) => {
    setup();
    await expect(api.probe(url)).rejects.toMatchObject({ code });
  });

  it("honours probe delays", async () => {
    const t = setup({ delays: { probe: 900 } });
    let done = false;
    const p = api.probe(VIDEO).then(() => (done = true));
    await t.clock.advanceAsync(800);
    expect(done).toBe(false);
    await t.clock.advanceAsync(200);
    await p;
    expect(done).toBe(true);
  });
  it("filed history rows carry the accession number and preset id; search finds them by number", async () => {
    const t = setup();
    const job = await api.enqueue(req(VIDEO));
    await t.clock.advanceAsync(60_000, 250);
    const page = await api.historyQuery({
      search: String(job.seq).padStart(6, "0"),
      kind: null,
      limit: 10,
      offset: 0,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ seq: job.seq, presetId: "mp4-1080" });
    const bare = await api.historyQuery({
      search: String(job.seq),
      kind: null,
      limit: 10,
      offset: 0,
    });
    expect(bare.items[0].seq).toBe(job.seq);
  });

  it("an outdated system yt-dlp reports an update and still downloads", async () => {
    setup({ scenario: "system-outdated" });
    const r = await api.depsReport(false);
    const y = r.deps.find((d) => d.id === "ytdlp")!;
    expect(y).toMatchObject({ state: "system", version: "2026.03.17", updateAvailable: true });
    expect((await api.probe(VIDEO)).kind).toBe("video");
  });
});
