import { beforeEach, describe, expect, it } from "vitest";
import { installMockBackend } from "../../ipc/mock";
import type { DepsReport, DepStatus, Job, ProbeResult } from "../../ipc/types";
import { fixKind } from "../../screens/shared/errorFixes";
import {
  depsNeedAttention,
  recommendedMissing,
  requiredReady,
  resetDepsStore,
  useDeps,
} from "../deps";
import { PAGE_SIZE, resetHistoryStore, useHistory } from "../history";
import { jobTotals, nextSeq, resetJobsStore, sortedJobs, useJobs } from "../jobs";
import { parseHash, toHash } from "../nav";
import { looksLikeUrl, resetReceiveStore, selectedDuration, useReceive } from "../receive";

const job = (p: Partial<Job>): Job => ({
  id: "j",
  seq: 1,
  url: "u",
  title: null,
  thumbnail: null,
  presetId: "best",
  kind: "video",
  stage: "queued",
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

describe("nav", () => {
  it("parses and prints hashes", () => {
    expect(parseHash("#settings/accounts")).toEqual({ route: "settings", section: "accounts" });
    expect(parseHash("#nope")).toEqual({ route: "receive", section: "downloads" });
    expect(toHash("catalog", "downloads")).toBe("#catalog");
    expect(toHash("settings", "advanced")).toBe("#settings/advanced");
  });
});

describe("jobs selectors", () => {
  it("sorts newest first, totals and predicts the next number", () => {
    const jobs = {
      a: job({ id: "a", seq: 3, stage: "downloading", speed: 100 }),
      b: job({ id: "b", seq: 7, stage: "queued" }),
      c: job({ id: "c", seq: 5, stage: "done" }),
      d: job({ id: "d", seq: 1, stage: "error" }),
      e: job({ id: "e", seq: 2, stage: "merging", speed: null }),
    };
    expect(sortedJobs(jobs).map((j) => j.seq)).toEqual([7, 5, 3, 2, 1]);
    expect(jobTotals(jobs)).toEqual({ active: 2, queued: 1, done: 1, failed: 1, speed: 100 });
    expect(nextSeq(jobs)).toBe(8);
    expect(nextSeq({})).toBeNull();
  });

  it("records a failed row action instead of throwing", async () => {
    resetJobsStore();
    installMockBackend();
    await useJobs.getState().cancel("missing-job");
    expect(useJobs.getState().actionErrors["missing-job"].detail).toMatch(/no such job/);
  });
});

describe("receive store", () => {
  const probe: ProbeResult = {
    kind: "playlist",
    url: "https://x.test/playlist?list=1",
    id: "1",
    title: "L",
    uploader: null,
    duration: 60,
    thumbnail: null,
    extractor: "youtube",
    formats: [],
    maxHeight: null,
    entries: [1, 2, 3, 4, 5].map((index) => ({
      index,
      id: null,
      title: `t${index}`,
      duration: index * 10,
      thumbnail: null,
      url: null,
    })),
  };
  beforeEach(() => {
    resetReceiveStore();
    useReceive.setState({ status: "ready", probe, selected: [1, 2, 3, 4, 5] });
  });

  it("toggles, extends with shift and builds the request", () => {
    const s = useReceive.getState();
    s.selectNone();
    s.toggle(2, true);
    s.toggle(4, true, true);
    expect(useReceive.getState().selected).toEqual([2, 3, 4]);
    s.toggle(3, false);
    expect(useReceive.getState().selected).toEqual([2, 4]);
    expect(selectedDuration(probe, [2, 4])).toBe(60);
    expect(useReceive.getState().request("best", null)!.playlistItems).toEqual([2, 4]);
    s.selectAll();
    expect(useReceive.getState().request("best", "D:\\x")!).toMatchObject({
      playlistItems: [],
      outputDir: "D:\\x",
    });
    s.selectRange(5, 4);
    expect(useReceive.getState().selected).toEqual([4, 5]);
    s.selectNone();
    expect(useReceive.getState().request("best", null)).toBeNull();
  });

  it("forgets the probe and secrets on reset; a new link clears the old card", () => {
    useReceive.getState().setSecret("videoPassword", "x");
    useReceive.getState().setUrl("https://other.test/v");
    expect(useReceive.getState().probe).toBeNull();
    useReceive.getState().reset();
    expect(useReceive.getState().videoPassword).toBe("");
    expect(looksLikeUrl("hello")).toBe(false);
    expect(looksLikeUrl(" https://youtu.be/x ")).toBe(true);
  });

  it("ignores a stale probe answer", async () => {
    installMockBackend({ delays: { probe: 0 } });
    const first = useReceive.getState().runProbe("https://www.youtube.com/watch?v=aaaaaaaaaaa");
    useReceive.getState().reset();
    expect(await first).toBeNull();
    expect(useReceive.getState().probe).toBeNull();
  });
});

describe("deps selectors", () => {
  const dep = (p: Partial<DepStatus>): DepStatus => ({
    id: "ytdlp",
    level: "required",
    state: "installed",
    version: "1",
    path: null,
    latest: null,
    updateAvailable: false,
    verified: true,
    canInstall: true,
    manualHint: null,
    error: null,
    ...p,
  });
  const report = (deps: DepStatus[], js = false): DepsReport => ({
    binDir: "b",
    deps,
    jsRuntime: js ? { name: "node", path: "n", version: null, managed: false } : null,
    jsRuntimesFound: [],
  });

  it("flags missing required tools and updates", () => {
    expect(depsNeedAttention(report([dep({})]))).toBe(false);
    expect(depsNeedAttention(report([dep({ state: "missing" })]))).toBe(true);
    expect(depsNeedAttention(report([dep({ updateAvailable: true })]))).toBe(true);
    expect(requiredReady(report([dep({ state: "system" })]))).toBe(true);
    expect(requiredReady(null)).toBe(false);
  });

  it("recommends Deno only without a JS runtime", () => {
    const deps = [
      dep({ id: "ffmpeg", state: "missing" }),
      dep({ id: "deno", level: "recommended", state: "missing" }),
      dep({ id: "aria2c", level: "optional", state: "missing" }),
    ];
    expect(recommendedMissing(report(deps)).map((d) => d.id)).toEqual(["ffmpeg", "deno"]);
    expect(recommendedMissing(report(deps, true)).map((d) => d.id)).toEqual(["ffmpeg"]);
  });

  it("installRecommended reports a failure and refreshes", async () => {
    resetDepsStore();
    const be = installMockBackend({ scenario: "first-run", clock: "manual", failDeps: ["ytdlp"] });
    const p = useDeps.getState().installRecommended();
    await be.manualClock.advanceAsync(3000);
    expect(await p).toBe(false);
    expect(useDeps.getState().allError?.detail).toMatch(/SHA-256/);
    expect(useDeps.getState().installingAll).toBe(false);
  });
});

describe("history store", () => {
  it("pages and steps back when a page empties", async () => {
    resetHistoryStore();
    const be = installMockBackend();
    await useHistory.getState().refresh();
    const total = useHistory.getState().total;
    expect(useHistory.getState().items).toHaveLength(Math.min(PAGE_SIZE, total));
    useHistory.setState({ page: 5 });
    await useHistory.getState().refresh();
    expect(useHistory.getState().page).toBe(Math.ceil(total / PAGE_SIZE) - 1);
    expect(be.calls.filter((c) => c.cmd === "history_query").length).toBeGreaterThan(2);
  });
});

describe("error fixes", () => {
  it("maps every recoverable code to a place", () => {
    expect(fixKind("bot_check")).toBe("accounts");
    expect(fixKind("login_required")).toBe("accounts");
    expect(fixKind("ffmpeg_missing")).toBe("install");
    expect(fixKind("js_runtime_missing")).toBe("install");
    expect(fixKind("binary_missing")).toBe("install");
    expect(fixKind("cookies_locked")).toBe("closeBrowser");
    expect(fixKind("disk_full")).toBe("folders");
    expect(fixKind("network")).toBe("none");
  });
});
