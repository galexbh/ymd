import type { Browser, BrowserInfo } from "../../ipc/types";

/** Categories accepted by `--sponsorblock-remove` (yt-dlp README; poi_highlight and chapter
 * can only be marked, not removed). */
export const SPONSORBLOCK_CATEGORIES = [
  "sponsor",
  "intro",
  "outro",
  "selfpromo",
  "preview",
  "filler",
  "interaction",
  "music_offtopic",
  "hook",
] as const;

/** Browsers ymd reads directly (`--cookies-from-browser`); Chromium ones go through the extension. */
export const DIRECT_BROWSERS: Browser[] = ["firefox", "safari"];

/** Installed browsers first (Brave leads), then the ones only listed as a suggestion. */
export function orderBrowsers(list: BrowserInfo[]): BrowserInfo[] {
  return [...list].sort(
    (a, b) =>
      Number(b.installed) - Number(a.installed) ||
      (a.browser === "brave" ? -1 : b.browser === "brave" ? 1 : a.browser.localeCompare(b.browser)),
  );
}

export const FIREFOX_DOWNLOAD_URL = "https://www.mozilla.org/firefox/new/";

/** Speed caps (MB/s) offered in «Límite de velocidad»; any other value goes through «Otro…». */
export const RATE_PRESETS = [1, 2, 5, 10, 20, 50] as const;
/** Bounds of `limitRateMbps`, as `settings::sanitize` enforces them. */
export const RATE_MIN = 1;
export const RATE_MAX = 1000;

export const isRatePreset = (n: number) => (RATE_PRESETS as readonly number[]).includes(n);

/** A whole number of MB/s within bounds, else null. */
export function parseRate(text: string): number | null {
  const v = text.trim();
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= RATE_MIN && n <= RATE_MAX ? n : null;
}
