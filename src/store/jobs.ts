// Jobs store: the live ledger, fed by `jobs_list` and the `job://*` events.
import { create } from "zustand";
import { api, toCommandError } from "../ipc/commands";
import { events } from "../ipc/events";
import {
  TERMINAL_STAGES,
  type CommandError,
  type EnqueueRequest,
  type Job,
  type JobId,
  type JobStage,
} from "../ipc/types";

export type JobListener = (job: Job, prev: Job | undefined) => void;

interface JobsState {
  jobs: Record<JobId, Job>;
  loaded: boolean;
  /** last failed row action, per job */
  actionErrors: Record<JobId, CommandError>;
  load: () => Promise<void>;
  upsert: (job: Job) => void;
  drop: (id: JobId) => void;
  enqueue: (req: EnqueueRequest) => Promise<Job>;
  cancel: (id: JobId) => Promise<void>;
  retry: (id: JobId) => Promise<void>;
  remove: (id: JobId) => Promise<void>;
  clearFinished: () => Promise<void>;
}

const listeners = new Set<JobListener>();

/** Be told about every job update (e.g. to toast completions). */
export function onJobChange(fn: JobListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const isTerminal = (stage: JobStage) => TERMINAL_STAGES.includes(stage);
export const isActive = (stage: JobStage) =>
  stage === "downloading" || stage === "merging" || stage === "postprocessing";

export const useJobs = create<JobsState>((set, get) => {
  const act = async (id: JobId, fn: () => Promise<unknown>) => {
    try {
      await fn();
      const { [id]: _drop, ...rest } = get().actionErrors;
      set({ actionErrors: rest });
    } catch (e) {
      set({ actionErrors: { ...get().actionErrors, [id]: toCommandError(e) } });
    }
  };

  return {
    jobs: {},
    loaded: false,
    actionErrors: {},

    load: async () => {
      try {
        const list = await api.jobsList();
        const jobs: Record<JobId, Job> = {};
        for (const j of list) jobs[j.id] = j;
        set({ jobs: { ...jobs, ...get().jobs }, loaded: true });
      } catch {
        set({ loaded: true });
      }
    },

    upsert: (job) => {
      const prev = get().jobs[job.id];
      set({ jobs: { ...get().jobs, [job.id]: job } });
      for (const fn of listeners) fn(job, prev);
    },

    drop: (id) => {
      const { [id]: _gone, ...rest } = get().jobs;
      set({ jobs: rest });
    },

    enqueue: async (req) => {
      const job = await api.enqueue(req);
      if (!get().jobs[job.id]) get().upsert(job);
      return job;
    },

    cancel: (id) => act(id, () => api.jobCancel(id)),
    retry: (id) => act(id, () => api.jobRetry(id).then((j) => get().upsert(j))),
    remove: (id) =>
      act(id, async () => {
        await api.jobRemove(id);
        get().drop(id);
      }),
    clearFinished: async () => {
      try {
        const ids = await api.jobsClearFinished();
        for (const id of ids) get().drop(id);
      } catch {
        // rows stay; nothing to undo
      }
    },
  };
});

/** Subscribe the store to backend events. Returns an unsubscribe. */
export async function connectJobs(): Promise<() => void> {
  const offs = await Promise.all([
    events.onJobUpdate((j) => useJobs.getState().upsert(j)),
    events.onJobRemoved((id) => useJobs.getState().drop(id)),
  ]);
  await useJobs.getState().load();
  return () => offs.forEach((f) => f());
}

export function resetJobsStore() {
  listeners.clear();
  useJobs.setState({ jobs: {}, loaded: false, actionErrors: {} });
}

// ───────────── selectors ─────────────

/** Newest first. */
export function sortedJobs(jobs: Record<JobId, Job>): Job[] {
  return Object.values(jobs).sort((a, b) => b.seq - a.seq);
}

export interface JobTotals {
  active: number;
  queued: number;
  done: number;
  failed: number;
  speed: number;
}

export function jobTotals(jobs: Record<JobId, Job>): JobTotals {
  const t: JobTotals = { active: 0, queued: 0, done: 0, failed: 0, speed: 0 };
  for (const j of Object.values(jobs)) {
    if (isActive(j.stage)) {
      t.active++;
      t.speed += j.speed ?? 0;
    } else if (j.stage === "queued") t.queued++;
    else if (j.stage === "done") t.done++;
    else t.failed++;
  }
  return t;
}

/** Next accession number the counter will hand out, when known from the ledger. */
export function nextSeq(jobs: Record<JobId, Job>): number | null {
  const seqs = Object.values(jobs).map((j) => j.seq);
  return seqs.length ? Math.max(...seqs) + 1 : null;
}
