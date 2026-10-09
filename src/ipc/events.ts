// Typed event subscriptions. Each returns an unlisten function.
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  EVT_DEPS_CHANGED,
  EVT_DEPS_PROGRESS,
  EVT_JOB_REMOVED,
  EVT_JOB_UPDATE,
  type DepProgress,
  type DepsReport,
  type Job,
  type JobId,
} from "./types";

export const events = {
  onJobUpdate: (cb: (job: Job) => void): Promise<UnlistenFn> =>
    listen<Job>(EVT_JOB_UPDATE, (e) => cb(e.payload)),
  onJobRemoved: (cb: (id: JobId) => void): Promise<UnlistenFn> =>
    listen<JobId>(EVT_JOB_REMOVED, (e) => cb(e.payload)),
  onDepsProgress: (cb: (p: DepProgress) => void): Promise<UnlistenFn> =>
    listen<DepProgress>(EVT_DEPS_PROGRESS, (e) => cb(e.payload)),
  onDepsChanged: (cb: (r: DepsReport) => void): Promise<UnlistenFn> =>
    listen<DepsReport>(EVT_DEPS_CHANGED, (e) => cb(e.payload)),
};
