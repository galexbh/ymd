import type { ThemeSettings } from "../ipc/types";
import { accentCssVars, deriveAccent, type ResolvedTheme } from "./accent";

/** localStorage key read by public/theme-boot.js before first paint. */
export const THEME_CACHE_KEY = "ymd.theme.v1";

export const DEFAULT_THEME: ThemeSettings = {
  mode: "system",
  accent: null,
  density: "comfortable",
  radius: "soft",
  fontScale: 1,
};

export const FONT_SCALE_MIN = 0.875;
export const FONT_SCALE_MAX = 1.25;

const ACCENT_VARS = ["--accent", "--accent-hover", "--accent-active", "--accent-soft", "--on-accent", "--focus"];

export interface ThemeCache {
  settings: ThemeSettings;
  /** precomputed accent vars per theme, null = theme default */
  vars: Record<ResolvedTheme, Record<string, string>> | null;
}

export interface AppliedTheme {
  resolved: ResolvedTheme;
  /** the custom accent was moved to stay readable in the resolved theme */
  adjusted: boolean;
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function systemPrefersDark(): boolean {
  try {
    return typeof window !== "undefined" && !!window.matchMedia?.(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

export function resolveMode(mode: ThemeSettings["mode"], prefersDark = systemPrefersDark()): ResolvedTheme {
  if (mode === "light" || mode === "dark") return mode;
  return prefersDark ? "dark" : "light";
}

export function clampFontScale(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, v));
}

function writeCache(cache: ThemeCache) {
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // convenience only; the Rust settings file is the source of truth
  }
}

export function readThemeCache(): ThemeCache | null {
  try {
    const raw = localStorage.getItem(THEME_CACHE_KEY);
    return raw ? (JSON.parse(raw) as ThemeCache) : null;
  } catch {
    return null;
  }
}

function setNativeTheme(mode: ThemeSettings["mode"]) {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  import("@tauri-apps/api/window")
    .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(mode === "system" ? null : mode))
    .catch(() => {
      // older platforms without per-window theme support
    });
}

/**
 * Applies theme settings to an element (the document root by default):
 * data-theme / data-density / data-radius, the font scale and accent vars.
 */
export function applyTheme(
  settings: ThemeSettings,
  root: HTMLElement = document.documentElement,
  prefersDark = systemPrefersDark(),
): AppliedTheme {
  const resolved = resolveMode(settings.mode, prefersDark);
  root.dataset.theme = resolved;
  root.dataset.density = settings.density;
  root.dataset.radius = settings.radius;
  root.style.setProperty("--font-scale", String(clampFontScale(settings.fontScale)));

  let adjusted = false;
  let vars: ThemeCache["vars"] = null;
  if (settings.accent) {
    const light = deriveAccent(settings.accent, "light");
    const dark = deriveAccent(settings.accent, "dark");
    vars = { light: accentCssVars(light), dark: accentCssVars(dark) };
    adjusted = (resolved === "light" ? light : dark).adjusted;
    for (const [k, v] of Object.entries(vars[resolved])) root.style.setProperty(k, v);
  } else {
    for (const k of ACCENT_VARS) root.style.removeProperty(k);
  }

  if (root === document.documentElement) {
    writeCache({ settings, vars });
    setNativeTheme(settings.mode);
  }
  return { resolved, adjusted };
}

/**
 * Calls `onChange` when the OS color scheme flips. Returns an unsubscribe.
 */
export function watchSystemTheme(onChange: (prefersDark: boolean) => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(DARK_QUERY);
  const handler = (e: MediaQueryListEvent) => onChange(e.matches);
  mql.addEventListener("change", handler);
  return () => mql.removeEventListener("change", handler);
}
