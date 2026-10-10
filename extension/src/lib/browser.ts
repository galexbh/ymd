// Which Chromium browser is running, for the `browser` field of the cookies message.

export type BrowserName = "brave" | "chrome" | "edge" | "chromium" | "vivaldi" | "opera" | "other";

export interface NavigatorLike {
  brave?: { isBrave?: () => Promise<boolean> | boolean };
  userAgentData?: { brands?: ReadonlyArray<{ brand: string }> };
}

// Checked in order: a browser's own brand wins over the "Chromium" every one of them lists.
const BRANDS: ReadonlyArray<[RegExp, BrowserName]> = [
  [/edge/i, "edge"],
  [/vivaldi/i, "vivaldi"],
  [/opera/i, "opera"],
  [/google chrome/i, "chrome"],
  [/^chromium$/i, "chromium"],
];

export async function detectBrowser(nav: NavigatorLike | undefined): Promise<BrowserName> {
  try {
    if (nav?.brave && typeof nav.brave.isBrave === "function" && (await nav.brave.isBrave())) {
      return "brave";
    }
  } catch {
    // fall through to the brands
  }
  const brands = nav?.userAgentData?.brands ?? [];
  for (const [pattern, name] of BRANDS) {
    if (brands.some((b) => pattern.test(b.brand))) return name;
  }
  return "other";
}
