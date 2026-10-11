// Jobs store: the live ledger, fed by `jobs_list` and the `job://*` events.
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { api, toCommandError } from "../ipc/commands";
import { events } from "../ipc/events";
import { settleListeners } from "./listen";
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
  /** scheduled queue start (RFC 3339) or null; mirrors `queue://schedule` */
  startAt: string | null;
  /** last failed schedule change */
  scheduleError: CommandError | null;
  /** hold queued jobs until `at` (ISO); null clears the schedule and starts them now */
  schedule: (at: string | null) => Promise<void>;
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

// ───────────── background coalescing ─────────────
// Hidden in the tray, ymd still gets ~4 progress events per second per job. Nobody sees them,
// so while the document is hidden a progress-only update (same, non-terminal stage) waits here
// and only the newest per job is applied, every FLUSH_HIDDEN_MS or when the window shows again.
// Stage changes and terminal states are applied at once: notifications depend on them.

/** How often buffered progress is applied while hidden. */
export const FLUSH_HIDDEN_MS = 2000;

const buffered = new Map<JobId, Job>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const docHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

/** Apply every buffered progress update now. */
export function flushJobUpdates(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (buffered.size === 0) return;
  const batch = [...buffered.values()];
  buffered.clear();
  const before = useJobs.getState().jobs;
  const jobs = { ...before };
  for (const j of batch) if (before[j.id]) jobs[j.id] = j;
  useJobs.setState({ jobs });
  for (const j of batch) {
    if (!before[j.id]) continue;
    for (const fn of listeners) fn(j, before[j.id]);
  }
}

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
      if (prev && prev.stage === job.stage && !isTerminal(job.stage) && docHidden()) {
        buffered.set(job.id, job);
        flushTimer ??= setTimeout(flushJobUpdates, FLUSH_HIDDEN_MS);
        return;
      }
      buffered.delete(job.id);
      set({ jobs: { ...get().jobs, [job.id]: job } });
      for (const fn of listeners) fn(job, prev);
    },

    drop: (id) => {
      buffered.delete(id);
      const { jobs, actionErrors } = get();
      if (!(id in jobs) && !(id in actionErrors)) return;
      const { [id]: _gone, ...rest } = jobs;
      const { [id]: _err, ...errors } = actionErrors;
      set({ jobs: rest, actionErrors: errors });
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
        // drop() also forgets each row's last action error
        for (const id of ids) get().drop(id);
      } catch {
        // rows stay; nothing to undo
      }
    },

    startAt: null,
    scheduleError: null,
    schedule: async (at) => {
      try {
        const startAt = await api.queueSchedule(at);
        set({ startAt, scheduleError: null });
      } catch (e) {
        set({ scheduleError: toCommandError(e) });
      }
    },
  };
});

/** Subscribe the store to backend events. Returns an unsubscribe. */
export async function connectJobs(): Promise<() => void> {
  const offs = await settleListeners([
    events.onJobUpdate((j) => useJobs.getState().upsert(j)),
    events.onJobRemoved((id) => useJobs.getState().drop(id)),
    events.onQueueSchedule(({ startAt }) => useJobs.setState({ startAt })),
  ]);
  const onVisible = () => {
    if (!docHidden()) flushJobUpdates();
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  await useJobs.getState().load();
  try {
    useJobs.setState({ startAt: await api.queueScheduleGet() });
  } catch {
    // no schedule known; the event keeps it current
  }
  return () => {
    offs.forEach((f) => f());
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisible);
    }
    flushJobUpdates();
  };
}

export function resetJobsStore() {
  listeners.clear();
  buffered.clear();
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  useJobs.setState({
    jobs: {},
    loaded: false,
    actionErrors: {},
    startAt: null,
    scheduleError: null,
  });
}

// ───────────── selectors ─────────────

/** Newest first. */
export function sortedJobs(jobs: Record<JobId, Job>): Job[] {
  return Object.values(jobs).sort((a, b) => b.seq - a.seq);
}

/** Ids of the jobs matching `filter`, newest first. */
export function sortedJobIds(jobs: Record<JobId, Job>, filter?: (j: Job) => boolean): JobId[] {
  const list = sortedJobs(jobs);
  return (filter ? list.filter(filter) : list).map((j) => j.id);
}

/**
 * Hook: the ledger's row ids, newest first. Compared shallowly, so a progress update (same
 * rows, same order) does not re-render the screen; each row subscribes to its own job.
 */
export function useJobIds(filter?: (j: Job) => boolean): JobId[] {
  return useJobs(useShallow((st) => sortedJobIds(st.jobs, filter)));
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
