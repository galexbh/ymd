// Dependencies store: the managed toolchain report plus live install progress.
import { create } from "zustand";
import { api, toCommandError } from "../ipc/commands";
import { events } from "../ipc/events";
import type { CommandError, DepId, DepProgress, DepsReport, DepStatus } from "../ipc/types";

export type DepBusy = "install" | "remove";

interface DepsState {
  report: DepsReport | null;
  loading: boolean;
  checking: boolean;
  installingAll: boolean;
  loadError: CommandError | null;
  allError: CommandError | null;
  progress: Partial<Record<DepId, DepProgress>>;
  busy: Partial<Record<DepId, DepBusy>>;
  errors: Partial<Record<DepId, CommandError>>;
  load: (checkLatest?: boolean) => Promise<void>;
  install: (id: DepId) => Promise<boolean>;
  remove: (id: DepId) => Promise<void>;
  installRecommended: () => Promise<boolean>;
  setReport: (r: DepsReport) => void;
  onProgress: (p: DepProgress) => void;
}

export const useDeps = create<DepsState>((set, get) => ({
  report: null,
  loading: false,
  checking: false,
  installingAll: false,
  loadError: null,
  allError: null,
  progress: {},
  busy: {},
  errors: {},

  load: async (checkLatest = false) => {
    set(checkLatest ? { checking: true } : { loading: true });
    try {
      const report = await api.depsReport(checkLatest);
      set({ report, loadError: null });
    } catch (e) {
      set({ loadError: toCommandError(e) });
    } finally {
      set({ loading: false, checking: false });
    }
  },

  install: async (id) => {
    const { [id]: _e, ...errors } = get().errors;
    set({ busy: { ...get().busy, [id]: "install" }, errors });
    try {
      const report = await api.depsInstall(id);
      set({ report });
      return true;
    } catch (e) {
      set({ errors: { ...get().errors, [id]: toCommandError(e) } });
      return false;
    } finally {
      const { [id]: _b, ...busy } = get().busy;
      set({ busy });
    }
  },

  remove: async (id) => {
    set({ busy: { ...get().busy, [id]: "remove" } });
    try {
      const report = await api.depsRemove(id);
      const { [id]: _p, ...progress } = get().progress;
      set({ report, progress });
    } catch (e) {
      set({ errors: { ...get().errors, [id]: toCommandError(e) } });
    } finally {
      const { [id]: _b, ...busy } = get().busy;
      set({ busy });
    }
  },

  installRecommended: async () => {
    set({ installingAll: true, allError: null, errors: {} });
    try {
      const report = await api.depsInstallRecommended();
      set({ report });
      return true;
    } catch (e) {
      set({ allError: toCommandError(e) });
      // the per-dep state comes back through deps://changed; refresh to be sure
      await get().load();
      return false;
    } finally {
      set({ installingAll: false });
    }
  },

  setReport: (report) => set({ report }),

  onProgress: (p) => {
    set({ progress: { ...get().progress, [p.id]: p } });
    if (p.phase === "error" && p.message) {
      set({ errors: { ...get().errors, [p.id]: { code: "unknown", detail: p.message } } });
    }
  },
}));

export async function connectDeps(): Promise<() => void> {
  const offs = await Promise.all([
    events.onDepsProgress((p) => useDeps.getState().onProgress(p)),
    events.onDepsChanged((r) => useDeps.getState().setReport(r)),
  ]);
  await useDeps.getState().load();
  return () => offs.forEach((f) => f());
}

export function resetDepsStore() {
  useDeps.setState({
    report: null,
    loading: false,
    checking: false,
    installingAll: false,
    loadError: null,
    allError: null,
    progress: {},
    busy: {},
    errors: {},
  });
}

// ───────────── selectors ─────────────

export function depById(r: DepsReport | null, id: DepId): DepStatus | undefined {
  return r?.deps.find((d) => d.id === id);
}

export const isPresent = (d: DepStatus | undefined) =>
  !!d && (d.state === "installed" || d.state === "system");

/** Something required is missing or an update is waiting: the rail shows a badge. */
export function depsNeedAttention(r: DepsReport | null): boolean {
  if (!r) return false;
  return r.deps.some((d) => (d.level === "required" && !isPresent(d)) || d.updateAvailable);
}

export function requiredReady(r: DepsReport | null): boolean {
  if (!r) return false;
  return r.deps.filter((d) => d.level === "required").every(isPresent);
}

/** What "Instalar lo necesario" would install: required + Deno when no JS runtime exists. */
export function recommendedMissing(r: DepsReport | null): DepStatus[] {
  if (!r) return [];
  return r.deps.filter(
    (d) =>
      (d.level === "required" ||
        (d.level === "recommended" && (d.id !== "deno" || !r.jsRuntime))) &&
      (d.state === "missing" || d.state === "error") &&
      d.canInstall,
  );
}
