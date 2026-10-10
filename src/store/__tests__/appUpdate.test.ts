import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const checkMock = vi.fn();
const relaunchMock = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({ check: () => checkMock() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: () => relaunchMock() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.2.0" }));

import { classifyUpdateError, resetAppUpdate, useAppUpdate } from "../appUpdate";

function fakeUpdate(version: string) {
  return {
    version,
    body: "  Notas de la versión  ",
    downloadAndInstall: vi.fn(async (cb: (e: unknown) => void) => {
      cb({ event: "Started", data: { contentLength: 100 } });
      cb({ event: "Progress", data: { chunkLength: 60 } });
      cb({ event: "Progress", data: { chunkLength: 40 } });
      cb({ event: "Finished" });
    }),
  };
}

describe("app update store", () => {
  beforeEach(() => {
    // The mock backend already defines __TAURI_INTERNALS__; make sure it exists.
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ ??= {};
    resetAppUpdate();
    checkMock.mockReset();
    relaunchMock.mockReset();
  });
  afterEach(() => resetAppUpdate());

  it("reports an available update with trimmed notes", async () => {
    checkMock.mockResolvedValue(fakeUpdate("0.3.0"));
    await expect(useAppUpdate.getState().check()).resolves.toBe(true);
    const s = useAppUpdate.getState();
    expect(s.status).toBe("available");
    expect(s.version).toBe("0.3.0");
    expect(s.current).toBe("0.2.0");
    expect(s.notes).toBe("Notas de la versión");
  });

  it("is up to date when the server has nothing newer", async () => {
    checkMock.mockResolvedValue(null);
    await expect(useAppUpdate.getState().check()).resolves.toBe(false);
    expect(useAppUpdate.getState().status).toBe("upToDate");
  });

  it("a silent check stays idle on failure, a manual one shows the error", async () => {
    checkMock.mockRejectedValue(new Error("offline"));
    await useAppUpdate.getState().check(true);
    expect(useAppUpdate.getState().status).toBe("idle");
    await useAppUpdate.getState().check();
    expect(useAppUpdate.getState().status).toBe("error");
    expect(useAppUpdate.getState().error).toBe("offline");
    expect(useAppUpdate.getState().errorKind).toBe("offline");
  });

  it("no published release yet is a calm state, not an error", async () => {
    // What tauri-plugin-updater reports when releases/latest/download/latest.json is a 404.
    checkMock.mockRejectedValue(new Error("Could not fetch a valid release JSON from the remote"));
    await useAppUpdate.getState().check();
    expect(useAppUpdate.getState().status).toBe("noReleases");
    expect(useAppUpdate.getState().error).toBeNull();
  });

  it("other failures keep the raw detail for the details line", async () => {
    checkMock.mockRejectedValue(new Error("signature verification failed"));
    await useAppUpdate.getState().check();
    expect(useAppUpdate.getState().status).toBe("error");
    expect(useAppUpdate.getState().errorKind).toBe("other");
    expect(useAppUpdate.getState().error).toBe("signature verification failed");
  });

  it("classifies the plugin's messages", () => {
    expect(classifyUpdateError("Could not fetch a valid release JSON from the remote")).toBe(
      "noReleases",
    );
    expect(classifyUpdateError("status 404 Not Found")).toBe("noReleases");
    expect(classifyUpdateError("error sending request for url (https://github.com/…)")).toBe(
      "offline",
    );
    expect(classifyUpdateError("operation timed out")).toBe("offline");
    expect(classifyUpdateError("signature verification failed")).toBe("other");
  });

  it("downloads with progress, then relaunches", async () => {
    const update = fakeUpdate("0.3.0");
    checkMock.mockResolvedValue(update);
    await useAppUpdate.getState().check();
    await useAppUpdate.getState().install();
    expect(update.downloadAndInstall).toHaveBeenCalledOnce();
    const s = useAppUpdate.getState();
    expect(s.downloaded).toBe(100);
    expect(s.total).toBe(100);
    expect(s.status).toBe("installing");
    expect(relaunchMock).toHaveBeenCalledOnce();
  });

  it("install without a found update does nothing", async () => {
    await useAppUpdate.getState().install();
    expect(useAppUpdate.getState().status).toBe("idle");
    expect(relaunchMock).not.toHaveBeenCalled();
  });
});
