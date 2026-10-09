// ymd's own updates (tauri-plugin-updater): check GitHub Releases' latest.json, download the
// signed installer, install it and relaunch. yt-dlp and friends are updated by the deps store.
import type { check as checkFn } from "@tauri-apps/plugin-updater";
import { create } from "zustand";

export type AppUpdateStatus =
  "idle" | "checking" | "upToDate" | "available" | "downloading" | "installing" | "error";

interface AppUpdateState {
  status: AppUpdateStatus;
  current: string | null;
  version: string | null;
  notes: string | null;
  downloaded: number;
  total: number | null;
  error: string | null;
  /** Check for an update. `silent` keeps the status idle when nothing is found or it fails. */
  check: (silent?: boolean) => Promise<boolean>;
  /** Download + install the update found by `check`, then relaunch. */
  install: () => Promise<void>;
}

type Update = Awaited<ReturnType<typeof checkFn>> | null;

let pending: Update = null;

export function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function currentVersion(): Promise<string | null> {
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return null;
  }
}

export const useAppUpdate = create<AppUpdateState>((set, get) => ({
  status: "idle",
  current: null,
  version: null,
  notes: null,
  downloaded: 0,
  total: null,
  error: null,

  check: async (silent = false) => {
    if (!inTauri() || get().status === "checking" || get().status === "downloading") return false;
    set({ status: silent ? get().status : "checking", error: null });
    const current = get().current ?? (await currentVersion());
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      pending = update;
      if (update) {
        set({
          status: "available",
          current,
          version: update.version,
          notes: update.body?.trim() || null,
        });
        return true;
      }
      set({ status: silent ? "idle" : "upToDate", current });
      return false;
    } catch (e) {
      set({
        status: silent ? "idle" : "error",
        current,
        error: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  },

  install: async () => {
    if (!pending) return;
    set({ status: "downloading", downloaded: 0, total: null, error: null });
    try {
      await pending.downloadAndInstall((ev) => {
        if (ev.event === "Started") set({ total: ev.data.contentLength ?? null });
        else if (ev.event === "Progress")
          set({ downloaded: get().downloaded + ev.data.chunkLength });
        else set({ status: "installing" });
      });
      set({ status: "installing" });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  },
}));

/** Test helper. */
export function resetAppUpdate() {
  pending = null;
  useAppUpdate.setState({
    status: "idle",
    current: null,
    version: null,
    notes: null,
    downloaded: 0,
    total: null,
    error: null,
  });
}
