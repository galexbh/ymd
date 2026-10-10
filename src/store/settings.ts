// Settings store: one optimistic copy of `Settings`, written back through `api.settingsSet`.
// Theme and language changes apply immediately; the backend's sanitized answer is adopted
// unless the user changed something newer in the meantime.
import { create } from "zustand";
import { api, toCommandError } from "../ipc/commands";
import type { CommandError, Preset, Settings } from "../ipc/types";
import { setLanguage } from "../i18n";
import { useTheme } from "../theme/useTheme";
import { clampFontScale } from "../theme/applyTheme";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface UpdateOptions {
  /** wait this long (ms) for more changes before writing; sliders and text fields */
  debounce?: number;
}

interface SettingsState {
  settings: Settings | null;
  loadError: CommandError | null;
  status: SaveStatus;
  saveError: CommandError | null;
  load: () => Promise<Settings | null>;
  /** change settings locally now and persist them (debounced when asked) */
  update: (patch: Partial<Settings> | ((s: Settings) => Settings), opts?: UpdateOptions) => void;
  /** write any pending change right away */
  flush: () => Promise<void>;
}

/** Client-side guard rails, mirroring the backend's sanitize for instant feedback. */
export function sanitizeLocal(s: Settings): Settings {
  const concurrency = Number.isFinite(s.concurrency) ? Math.round(s.concurrency) : 3;
  return {
    ...s,
    concurrency: Math.min(8, Math.max(1, concurrency)),
    theme: { ...s.theme, fontScale: clampFontScale(s.theme.fontScale) },
  };
}

/** How long «Guardado» stays before the indicator goes quiet again. */
export const SAVED_VISIBLE_MS = 2500;

let version = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let savedTimer: ReturnType<typeof setTimeout> | null = null;
let pending: Promise<void> | null = null;

function applySideEffects(prev: Settings | null, next: Settings) {
  if (!prev || JSON.stringify(prev.theme) !== JSON.stringify(next.theme)) {
    useTheme.getState().setTheme(next.theme);
  }
  if (!prev || prev.language !== next.language) setLanguage(next.language);
}

export const useSettings = create<SettingsState>((set, get) => {
  const persist = async () => {
    const current = get().settings;
    if (!current) return;
    const sent = version;
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = null;
    set({ status: "saving", saveError: null });
    try {
      const saved = await api.settingsSet(current);
      if (sent === version) {
        const prev = get().settings;
        set({ settings: saved, status: "saved" });
        applySideEffects(prev, saved);
        // «Guardado» is a confirmation, not a state: it fades back to idle. Errors stay.
        savedTimer = setTimeout(() => {
          savedTimer = null;
          if (get().status === "saved") set({ status: "idle" });
        }, SAVED_VISIBLE_MS);
      } else {
        set({ status: "saving" });
      }
    } catch (e) {
      set({ status: "error", saveError: toCommandError(e) });
    }
  };

  return {
    settings: null,
    loadError: null,
    status: "idle",
    saveError: null,

    load: async () => {
      try {
        const s = await api.settingsGet();
        const prev = get().settings;
        set({ settings: s, loadError: null });
        applySideEffects(prev, s);
        return s;
      } catch (e) {
        set({ loadError: toCommandError(e) });
        return null;
      }
    },

    update: (patch, opts) => {
      const prev = get().settings;
      if (!prev) return;
      const merged = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
      const next = sanitizeLocal(merged);
      version++;
      set({ settings: next });
      applySideEffects(prev, next);
      if (timer) clearTimeout(timer);
      timer = null;
      const run = () => {
        timer = null;
        pending = persist().finally(() => {
          pending = null;
        });
      };
      if (opts?.debounce && opts.debounce > 0) timer = setTimeout(run, opts.debounce);
      else run();
    },

    flush: async () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        await persist();
      } else if (pending) {
        await pending;
      }
    },
  };
});

/** Reset module state between tests. */
export function resetSettingsStore() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (savedTimer) clearTimeout(savedTimer);
  savedTimer = null;
  pending = null;
  version = 0;
  useSettings.setState({
    settings: null,
    loadError: null,
    status: "idle",
    saveError: null,
  });
}

// ───────────── presets helpers ─────────────

export const BUILTIN_PRESET_IDS = ["best", "mp4-1080", "mp4-720", "mp3-320", "audio-original"];

export function isBuiltinId(id: string): boolean {
  return BUILTIN_PRESET_IDS.includes(id);
}

export function presetsOfKind(s: Settings | null, kind: Preset["kind"]): Preset[] {
  return (s?.presets ?? []).filter((p) => p.kind === kind);
}

export function newPresetId(existing: Preset[]): string {
  let n = existing.length + 1;
  const ids = new Set(existing.map((p) => p.id));
  while (ids.has(`custom-${n}`)) n++;
  return `custom-${n}`;
}
