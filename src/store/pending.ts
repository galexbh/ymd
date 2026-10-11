// Downloads a previous session left unfinished (`jobs_pending`). Nothing resumes on its own:
// the Registro screen offers to resume or discard them.
import { create } from "zustand";
import { api } from "../ipc/commands";
import type { PendingJob } from "../ipc/types";
import { useJobs } from "./jobs";

interface PendingState {
  items: PendingJob[];
  /** an action is in flight (buttons disabled) */
  busy: boolean;
  load: () => Promise<void>;
  /** Re-queue the resumable ones (not those needing a password or code). */
  resumeAll: () => Promise<void>;
  /** Forget the given ones (default: all) and their partial files. */
  discard: (ids?: string[]) => Promise<void>;
}

export const usePending = create<PendingState>((set, get) => {
  const run = async (fn: () => Promise<void>) => {
    if (get().busy) return;
    set({ busy: true });
    try {
      await fn();
    } catch {
      // the rows stay listed; the next load shows the truth
    } finally {
      set({ busy: false });
      await get().load();
    }
  };

  return {
    items: [],
    busy: false,
    load: async () => {
      try {
        set({ items: await api.jobsPending() });
      } catch {
        set({ items: [] });
      }
    },
    resumeAll: () =>
      run(async () => {
        const ids = resumable(get().items).map((p) => p.id);
        if (ids.length === 0) return;
        const jobs = await api.jobsResume(ids);
        for (const j of jobs) {
          if (!useJobs.getState().jobs[j.id]) useJobs.getState().upsert(j);
        }
      }),
    discard: (ids) =>
      run(async () => {
        const list = ids ?? get().items.map((p) => p.id);
        if (list.length > 0) await api.jobsDiscardPending(list);
      }),
  };
});

export const resumable = (items: PendingJob[]) => items.filter((p) => !p.needsSecret);
export const needingSecret = (items: PendingJob[]) => items.filter((p) => p.needsSecret);

export function resetPendingStore() {
  usePending.setState({ items: [], busy: false });
}
