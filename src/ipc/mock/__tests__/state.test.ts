import { describe, expect, it } from "vitest";
import { api, isCommandError, toCommandError } from "../../commands";
import { events } from "../../events";
import type { DepProgress, DepsReport, Settings } from "../../types";
import {
  getMockBackend,
  installMockBackend,
  resetMockBackend,
  sanitizeSettings,
  thumbnail,
} from "..";
import { bootMock } from "../boot";

const dep = (r: DepsReport, id: string) => r.deps.find((d) => d.id === id)!;

describe("mock backend — dependencies", () => {
  it("first-run: everything missing, no JS runtime, not onboarded, empty history", async () => {
    installMockBackend({ scenario: "first-run", clock: "manual" });
    const r = await api.depsReport();
    expect(r.deps.map((d) => d.state)).toEqual(Array(5).fill("missing"));
    expect(r.jsRuntime).toBeNull();
    expect(r.binDir).toBe("C:\\Users\\ana\\AppData\\Local\\ymd\\bin");
    expect((await api.settingsGet()).onboarded).toBe(false);
    expect((await api.historyQuery({ search: null, kind: null, limit: 50, offset: 0 })).total).toBe(
      0,
    );
  });

  it("ready: yt-dlp + ffmpeg installed, node detected", async () => {
    installMockBackend({ scenario: "ready", clock: "manual" });
    const r = await api.depsReport();
    expect(dep(r, "ytdlp").state).toBe("installed");
    expect(dep(r, "ffmpeg").state).toBe("installed");
    expect(dep(r, "deno").state).toBe("missing");
    expect(r.jsRuntime?.name).toBe("node");
    expect(r.jsRuntime?.managed).toBe(false);
  });

  it("outdated: yt-dlp has an update available; checkLatest fills `latest`", async () => {
    installMockBackend({ scenario: "outdated", clock: "manual" });
    const r = await api.depsReport();
    expect(dep(r, "ytdlp").updateAvailable).toBe(true);
    expect(dep(r, "ffmpeg").latest).toBeNull();
    const r2 = await api.depsReport(true);
    expect(dep(r2, "ffmpeg").latest).not.toBeNull();
    expect(dep(r2, "ffmpeg").updateAvailable).toBe(false);
  });

  it("deps_install emits resolving → downloading → verifying → extracting → done over ~2s", async () => {
    const be = installMockBackend({ scenario: "first-run", clock: "manual" });
    const progress: DepProgress[] = [];
    const changed: DepsReport[] = [];
    await events.onDepsProgress((p) => progress.push(p));
    await events.onDepsChanged((r) => changed.push(r));

    let result: DepsReport | null = null;
    const pending = api.depsInstall("ffmpeg").then((r) => (result = r));
    await be.manualClock.advanceAsync(1900, 100);
    expect(result).toBeNull();
    expect(dep(be.snapshot().deps, "ffmpeg").state).toBe("installing");
    await be.manualClock.advanceAsync(200, 100);
    await pending;

    const phases = progress.map((p) => p.phase).filter((p, i, a) => a[i - 1] !== p);
    expect(phases).toEqual(["resolving", "downloading", "verifying", "extracting", "done"]);
    const dl = progress.filter((p) => p.phase === "downloading");
    expect(dl[dl.length - 1].received).toBe(dl[dl.length - 1].total);
    expect(dep(result!, "ffmpeg").state).toBe("installed");
    expect(dep(result!, "ffmpeg").verified).toBe(true);
    expect(changed).toHaveLength(1);
  });

  it("yt-dlp is a raw executable: no extracting phase", async () => {
    const be = installMockBackend({ scenario: "first-run", clock: "manual" });
    const phases = new Set<string>();
    await events.onDepsProgress((p) => phases.add(p.phase));
    const p = api.depsInstall("ytdlp");
    await be.manualClock.advanceAsync(2500);
    await p;
    expect(phases.has("extracting")).toBe(false);
  });

  it("a checksum failure rejects, reports error and keeps an installed copy", async () => {
    const be = installMockBackend({ scenario: "ready", clock: "manual", failDeps: ["ffmpeg"] });
    const p = api.depsInstall("ffmpeg").catch((e: unknown) => e);
    await be.manualClock.advanceAsync(2500);
    expect(await p).toMatchObject({ code: "unknown", detail: expect.stringMatching(/SHA-256/) });
    const r = await api.depsReport();
    expect(dep(r, "ffmpeg").state).toBe("installed");
    expect(dep(r, "ffmpeg").error).toMatch(/SHA-256/);

    be.setDepFails("ffmpeg", false);
    be.setDepFails("deno", true);
    const p2 = api.depsInstall("deno").catch((e: unknown) => e);
    await be.manualClock.advanceAsync(2500);
    await p2;
    expect(dep(await api.depsReport(), "deno").state).toBe("error");
  });

  it("installing Deno makes it the managed JS runtime; removing it falls back", async () => {
    const be = installMockBackend({ scenario: "ready", clock: "manual" });
    const p = api.depsInstall("deno");
    await be.manualClock.advanceAsync(2500);
    const r = await p;
    expect(r.jsRuntime).toMatchObject({ name: "deno", managed: true });
    const r2 = await api.depsRemove("deno");
    expect(dep(r2, "deno").state).toBe("missing");
    expect(r2.jsRuntime?.name).toBe("node");
  });

  it("install_recommended installs required deps and Deno when no runtime exists", async () => {
    const be = installMockBackend({ scenario: "first-run", clock: "manual" });
    const p = api.depsInstallRecommended();
    await be.manualClock.advanceAsync(10_000, 100);
    const r = await p;
    expect(r.deps.filter((d) => d.state === "installed").map((d) => d.id)).toEqual([
      "ytdlp",
      "ffmpeg",
      "deno",
    ]);
  });

  it("guards: double install, ytdlp swap while downloading, aria2c outside Windows", async () => {
    const be = installMockBackend({ scenario: "ready", clock: "manual" });
    const first = api.depsInstall("ffmpeg");
    await expect(api.depsInstall("ffmpeg")).rejects.toMatchObject({ code: "unknown" });
    await expect(api.depsRemove("ffmpeg")).rejects.toMatchObject({ code: "unknown" });
    await be.manualClock.advanceAsync(2500);
    await first;

    await api.enqueue({
      url: "https://www.youtube.com/watch?v=abcdefghijk",
      presetId: "best",
      playlistItems: null,
      outputDir: null,
      videoPassword: null,
      twofactor: null,
      title: null,
      thumbnail: null,
    });
    await be.manualClock.advanceAsync(300);
    await expect(api.depsInstall("ytdlp")).rejects.toMatchObject({ code: "unknown" });
    await expect(api.depsRemove("ytdlp")).rejects.toMatchObject({ code: "unknown" });

    installMockBackend({ scenario: "ready", clock: "manual", platform: "linux" });
    const aria = dep(await api.depsReport(), "aria2c");
    expect(aria.canInstall).toBe(false);
    expect(aria.manualHint).toMatch(/apt/);
    await expect(api.depsInstall("aria2c")).rejects.toMatchObject({ code: "unknown" });
  });

  it("setScenario switches state at runtime and emits deps://changed", async () => {
    const be = installMockBackend({ scenario: "ready", clock: "manual" });
    const seen: DepsReport[] = [];
    await events.onDepsChanged((r) => seen.push(r));
    be.setScenario("complete");
    expect(seen).toHaveLength(1);
    expect(seen[0].deps.every((d) => d.state === "installed")).toBe(true);
    expect(seen[0].jsRuntime?.name).toBe("deno");
  });
});

describe("mock backend — history", () => {
  it("is seeded with ~25 mixed items, some missing on disk", async () => {
    installMockBackend({ clock: "manual" });
    const page = await api.historyQuery({ search: null, kind: null, limit: 100, offset: 0 });
    expect(page.total).toBe(25);
    expect(page.items.some((i) => i.kind === "audio")).toBe(true);
    expect(page.items.some((i) => i.kind === "video")).toBe(true);
    expect(page.items.filter((i) => !i.exists).length).toBeGreaterThan(0);
    const dates = page.items.map((i) => i.completedAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("searches title/url/filepath case-insensitively, filters by kind and paginates", async () => {
    installMockBackend({ clock: "manual" });
    const q = (
      search: string | null,
      kind: "video" | "audio" | null = null,
      limit = 50,
      offset = 0,
    ) => api.historyQuery({ search, kind, limit, offset });
    expect((await q("MASA MADRE")).items.map((i) => i.title)).toEqual([
      "Cómo hacer pan de masa madre en casa",
    ]);
    expect((await q("vimeo.com")).total).toBe(2);
    expect((await q(".mp3")).items.every((i) => i.kind === "audio")).toBe(true);
    const audio = await q(null, "audio");
    expect(audio.items.every((i) => i.kind === "audio")).toBe(true);
    const p1 = await q(null, null, 10, 0);
    const p3 = await q(null, null, 10, 20);
    expect(p1.items).toHaveLength(10);
    expect(p3.items).toHaveLength(5);
    expect(p3.total).toBe(25);
  });

  it("deletes one item or clears all", async () => {
    installMockBackend({ clock: "manual" });
    const { items } = await api.historyQuery({ search: null, kind: null, limit: 1, offset: 0 });
    await api.historyDelete(items[0].id);
    expect((await api.historyQuery({ search: null, kind: null, limit: 50, offset: 0 })).total).toBe(
      24,
    );
    await api.historyClear();
    expect((await api.historyQuery({ search: null, kind: null, limit: 50, offset: 0 })).total).toBe(
      0,
    );
  });
});

describe("mock backend — settings", () => {
  it("returns defaults with the builtin presets", async () => {
    installMockBackend({ clock: "manual" });
    const s = await api.settingsGet();
    expect(s.presets.map((p) => p.id)).toEqual([
      "best",
      "mp4-1080",
      "mp4-720",
      "mp3-320",
      "audio-original",
    ]);
    expect(s.concurrency).toBe(3);
    expect(s.cookies).toEqual({ kind: "none" });
  });

  it("sanitizes on save like settings::sanitize", async () => {
    installMockBackend({ clock: "manual" });
    const s = await api.settingsGet();
    const saved = await api.settingsSet({
      ...s,
      concurrency: 42,
      filenameTemplate: "  ",
      theme: { ...s.theme, fontScale: 3, accent: "#ABCDEF" },
      presets: [s.presets[0], s.presets[0], s.presets[3]],
      defaultPresetId: "gone",
    });
    expect(saved.concurrency).toBe(8);
    expect(saved.theme.fontScale).toBe(1.25);
    expect(saved.theme.accent).toBe("#abcdef");
    expect(saved.filenameTemplate).toBe("%(title)s [%(id)s].%(ext)s");
    expect(saved.presets.map((p) => p.id)).toEqual(["best", "mp3-320"]);
    expect(saved.defaultPresetId).toBe("best");
    expect(await api.settingsGet()).toEqual(saved);

    const low = await api.settingsSet({
      ...saved,
      concurrency: 0,
      theme: { ...saved.theme, fontScale: 0.1, accent: "red" },
      presets: [],
    });
    expect(low.concurrency).toBe(1);
    expect(low.theme.fontScale).toBe(0.875);
    expect(low.theme.accent).toBeNull();
    expect(low.presets).toHaveLength(5);
  });

  it("returned settings are copies (no shared mutable state)", async () => {
    installMockBackend({ clock: "manual" });
    const s = await api.settingsGet();
    s.concurrency = 7;
    expect((await api.settingsGet()).concurrency).toBe(3);
  });

  it("sanitizeSettings fills empty folders and keeps a valid binDir", () => {
    const base = installMockBackend({ clock: "manual" }).snapshot().settings;
    const out = sanitizeSettings(
      { ...base, videoDir: "", audioDir: " ", binDir: "  " } as Settings,
      base,
    );
    expect(out.videoDir).toBe(base.videoDir);
    expect(out.audioDir).toBe(base.audioDir);
    expect(out.binDir).toBeNull();
  });

  it("raising concurrency starts queued jobs", async () => {
    const be = installMockBackend({
      clock: "manual",
      settings: { concurrency: 1 } as Partial<Settings>,
    });
    const r = (n: number) => ({
      url: `https://www.youtube.com/watch?v=abcdefghij${n}`,
      presetId: "best",
      playlistItems: null,
      outputDir: null,
      videoPassword: null,
      twofactor: null,
      title: null,
      thumbnail: null,
    });
    await api.enqueue(r(1));
    await api.enqueue(r(2));
    expect((await api.jobsList()).map((j) => j.stage)).toEqual(["downloading", "queued"]);
    await api.settingsSet({ ...be.snapshot().settings, concurrency: 2 });
    expect((await api.jobsList()).map((j) => j.stage)).toEqual(["downloading", "downloading"]);
  });
});

describe("mock backend — auth", () => {
  it("detects Brave (2 profiles, running) and Firefox", async () => {
    installMockBackend({ clock: "manual" });
    const b = await api.browsersDetect();
    expect(b.map((x) => x.browser)).toEqual(["brave", "firefox"]);
    expect(b[0].profiles.map((p) => p.name)).toEqual(["Personal", "Trabajo"]);
    expect(b[0].running).toBe(true);
  });

  it("cookies test/snapshot fail with cookies_locked while Brave runs", async () => {
    const be = installMockBackend({ clock: "manual" });
    const res = await api.cookiesTest({ kind: "browser", browser: "brave", profile: "Default" });
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("cookies_locked");
    await expect(api.cookiesSnapshot("brave", "Profile 1")).rejects.toMatchObject({
      code: "cookies_locked",
    });

    be.setBrowserRunning("brave", false);
    expect((await api.cookiesTest({ kind: "browser", browser: "brave", profile: null })).ok).toBe(
      true,
    );
    const info = await api.cookiesSnapshot("brave", "Profile 1");
    expect(info.origin).toBe("brave:Trabajo");
    expect(info.cookieCount).toBeGreaterThan(0);
    expect(await api.cookiesInfo()).toEqual(info);
    await api.cookiesClear();
    expect(await api.cookiesInfo()).toBeNull();
  });

  it("cookies import / file test / unknown profiles", async () => {
    installMockBackend({ clock: "manual" });
    expect((await api.cookiesTest({ kind: "none" })).ok).toBe(true);
    expect((await api.cookiesTest({ kind: "file" })).ok).toBe(false);
    await expect(api.cookiesImport("C:\\x\\cookies.json")).rejects.toMatchObject({
      code: "unknown",
    });
    const info = await api.cookiesImport("C:\\Users\\ana\\Downloads\\cookies.txt");
    expect(info.origin).toBe("file");
    expect((await api.cookiesTest({ kind: "file" })).ok).toBe(true);
    expect((await api.cookiesTest({ kind: "browser", browser: "firefox", profile: null })).ok).toBe(
      true,
    );
    expect((await api.cookiesTest({ kind: "browser", browser: "chrome", profile: null })).ok).toBe(
      false,
    );
    await expect(api.cookiesSnapshot("brave", "Nope")).rejects.toMatchObject({ code: "unknown" });
  });

  it("credentials CRUD never returns passwords", async () => {
    installMockBackend({ clock: "manual" });
    expect(await api.credentialsList()).toEqual([]);
    await api.credentialsSet(" vimeo ", " ana@example.com ", "s3cret");
    const list = await api.credentialsSet("nebula", "ana", "pw");
    expect(list).toEqual([
      { extractor: "nebula", username: "ana" },
      { extractor: "vimeo", username: "ana@example.com" },
    ]);
    expect(JSON.stringify(list)).not.toContain("s3cret");
    await expect(api.credentialsSet("x", "", "pw")).rejects.toMatchObject({ code: "unknown" });
    expect(await api.credentialsDelete("vimeo")).toEqual([
      { extractor: "nebula", username: "ana" },
    ]);
  });
});

describe("mock backend — transport & helpers", () => {
  it("unknown commands reject with a CommandError; plugin calls succeed", async () => {
    const be = installMockBackend({ clock: "manual" });
    const { invoke } = await import("@tauri-apps/api/core");
    await expect(invoke("does_not_exist")).rejects.toMatchObject({ code: "unknown" });
    expect(await invoke("plugin:dialog|open", { options: { directory: true } })).toMatch(/ymd$/);
    expect(await invoke("plugin:dialog|open", { options: {} })).toMatch(/cookies\.txt$/);
    expect(await invoke("plugin:opener|open_path", { path: "x" })).toBeNull();
    expect(be.calls.map((c) => c.cmd)).toContain("plugin:opener|open_path");
  });

  it("command latency is applied in simulated time", async () => {
    const be = installMockBackend({ clock: "manual", delays: { command: 100 } });
    let done = false;
    const p = api.settingsGet().then(() => (done = true));
    await be.manualClock.advanceAsync(50);
    expect(done).toBe(false);
    await be.manualClock.advanceAsync(60);
    await p;
    expect(done).toBe(true);
  });

  it("reset removes the backend and stops timers", () => {
    const be = installMockBackend({ clock: "manual" });
    expect(getMockBackend()).toBe(be);
    resetMockBackend();
    expect(getMockBackend()).toBeNull();
    expect(be.manualClock.pending).toBe(0);
  });

  it("manualClock throws for real clocks; runAll drains timers", async () => {
    const real = installMockBackend();
    expect(() => real.manualClock).toThrow(/manual/);
    const be = installMockBackend({ clock: "manual" });
    void api.depsInstall("deno");
    be.manualClock.runAll();
    expect(be.manualClock.pending).toBe(0);
  });

  it("isCommandError / toCommandError normalise rejections", () => {
    expect(isCommandError({ code: "network", detail: "x" })).toBe(true);
    expect(isCommandError("nope")).toBe(false);
    expect(toCommandError(new Error("boom"))).toEqual({ code: "unknown", detail: "boom" });
    expect(toCommandError("plain")).toEqual({ code: "unknown", detail: "plain" });
    const e = { code: "private", detail: "d" } as const;
    expect(toCommandError(e)).toBe(e);
  });

  it("thumbnails are local SVG data URIs, stable per seed", () => {
    expect(thumbnail("a")).toBe(thumbnail("a"));
    expect(thumbnail("a")).not.toBe(thumbnail("b"));
    expect(decodeURIComponent(thumbnail("x", "audio", "<Tom & Jerry>"))).toContain(
      "&lt;Tom &amp; Jerry&gt;",
    );
  });

  it("bootMock installs a realistic backend and exposes it on window", async () => {
    window.history.replaceState(null, "", "/?scenario=first-run&speed=3&brave=closed");
    const be = bootMock();
    expect(window.__YMD_MOCK__).toBe(be);
    expect(window.__TAURI_OS_PLUGIN_INTERNALS__?.platform).toBe("windows");
    const browsers = be.snapshot();
    expect(browsers.deps.deps.every((d) => d.state === "missing")).toBe(true);
    window.history.replaceState(null, "", "/?scenario=bogus");
    bootMock();
    expect(getMockBackend()!.snapshot().deps.deps[0].state).toBe("installed");
    window.history.replaceState(null, "", "/");
  });
});
