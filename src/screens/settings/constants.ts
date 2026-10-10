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
