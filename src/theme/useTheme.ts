import { create } from "zustand";
import type { ThemeSettings } from "../ipc/types";
import type { ResolvedTheme } from "./accent";
import { applyTheme, DEFAULT_THEME, readThemeCache, resolveMode, systemPrefersDark, watchSystemTheme } from "./applyTheme";

interface ThemeState {
  settings: ThemeSettings;
  resolved: ResolvedTheme;
  /** the custom accent was moved for contrast in the current theme */
  accentAdjusted: boolean;
  /** replace all theme settings (e.g. after loading Settings from Rust) */
  setTheme: (settings: ThemeSettings) => void;
  /** change some theme settings; the caller persists them to Rust */
  updateTheme: (patch: Partial<ThemeSettings>) => ThemeSettings;
}

let stopWatching: (() => void) | null = null;

function commit(settings: ThemeSettings) {
  const { resolved, adjusted } = applyTheme(settings);
  stopWatching?.();
  stopWatching = null;
  if (settings.mode === "system") {
    stopWatching = watchSystemTheme((dark) => {
      const current = useTheme.getState().settings;
      const r = applyTheme(current, document.documentElement, dark);
      useTheme.setState({ resolved: r.resolved, accentAdjusted: r.adjusted });
    });
  }
  return { resolved, adjusted };
}

const initial = readThemeCache()?.settings ?? DEFAULT_THEME;

export const useTheme = create<ThemeState>((set, get) => ({
  settings: initial,
  resolved: resolveMode(initial.mode, systemPrefersDark()),
  accentAdjusted: false,
  setTheme: (settings) => {
    const r = commit(settings);
    set({ settings, resolved: r.resolved, accentAdjusted: r.adjusted });
  },
  updateTheme: (patch) => {
    const settings = { ...get().settings, ...patch };
    const r = commit(settings);
    set({ settings, resolved: r.resolved, accentAdjusted: r.adjusted });
    return settings;
  },
}));

/** 'light' | 'dark' after resolving System against the OS preference. */
export function useResolvedTheme(): ResolvedTheme {
  return useTheme((s) => s.resolved);
}

/** Apply the cached/initial settings once at startup (call from main.tsx). */
export function initTheme() {
  useTheme.getState().setTheme(useTheme.getState().settings);
}

export { applyTheme };
