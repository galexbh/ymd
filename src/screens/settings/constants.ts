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

/** Browsers whose cookie store yt-dlp can't read on Windows while open (and often not at all). */
export const CHROMIUM: Browser[] = [
  "brave",
  "chrome",
  "chromium",
  "edge",
  "opera",
  "vivaldi",
  "whale",
];

/** Brave first, then whatever else was found. */
export function orderBrowsers(list: BrowserInfo[]): BrowserInfo[] {
  return [...list].sort((a, b) =>
    a.browser === "brave" ? -1 : b.browser === "brave" ? 1 : a.browser.localeCompare(b.browser),
  );
}
