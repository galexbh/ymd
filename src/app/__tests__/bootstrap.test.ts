import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupI18n } from "../../i18n";
import { events } from "../../ipc/events";
import { installMockBackend } from "../../ipc/mock";
import type { Job } from "../../ipc/types";
import { useHistory } from "../../store/history";
import { useNav } from "../../store/nav";
import { useToasts } from "../../ui";
import { announce, useBootstrap } from "../useBootstrap";
import { resetStores } from "./harness";

const job = (stage: Job["stage"]): Job => ({
  id: "j",
  seq: 1,
  url: "https://example.com/j",
  title: "Clip",
  thumbnail: null,
  presetId: "best",
  kind: "video",
  stage,
  progress: stage === "done" ? 1 : 0.5,
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
  clip: null,
});

beforeEach(() => {
  setupI18n("es");
  resetStores();
});
afterEach(() => vi.restoreAllMocks());

describe("announce (a download was filed)", () => {
  it("re-queries the catalog only while it is on screen", () => {
    useHistory.setState({ status: "ready" });
    const refresh = vi.fn(async () => {});
    useHistory.setState({ refresh });

    useNav.getState().navigate("receive");
    announce(job("done"), job("downloading"));
    expect(refresh).not.toHaveBeenCalled();
    expect(useToasts.getState().toasts).toHaveLength(1);

    useNav.getState().navigate("catalog");
    announce({ ...job("done"), id: "k" }, { ...job("downloading"), id: "k" });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("useBootstrap", () => {
  it("a failed event subscription is reported, not left as an unhandled rejection", async () => {
    installMockBackend({ clock: "manual" });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const offProgress = vi.fn();
    vi.spyOn(events, "onDepsProgress").mockResolvedValue(offProgress);
    vi.spyOn(events, "onDepsChanged").mockRejectedValue(new Error("listen failed"));
    const { unmount } = renderHook(() => useBootstrap());
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(String(error.mock.calls[0][1])).toMatch(/listen failed/);
    // what did connect is still undone on unmount; what failed already cleaned up after itself
    expect(offProgress).toHaveBeenCalledTimes(1);
    unmount();
  });
});
