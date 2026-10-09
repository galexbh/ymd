// Shared Playwright helpers. Import `test`/`expect` from here instead of @playwright/test.
import { test as base, expect, type Page } from "@playwright/test";

export type Scenario = "first-run" | "ready" | "outdated" | "complete";
export type ColorScheme = "light" | "dark";

export interface OpenOptions {
  scenario?: Scenario;
  /** Mock download speed factor (higher = faster jobs). */
  speed?: number;
  /** Brave closed → cookie snapshot/test succeed. */
  braveClosed?: boolean;
}

/** Open the app in mock mode with a given backend scenario. */
export async function openApp(page: Page, opts: OpenOptions = {}): Promise<void> {
  const params = new URLSearchParams({
    scenario: opts.scenario ?? "ready",
    speed: String(opts.speed ?? 8),
    brave: opts.braveClosed ? "closed" : "open",
  });
  await page.goto(`/?${params.toString()}`);
  await page.waitForFunction(() => Boolean(window.__YMD_MOCK__));
}

export const test = base.extend<{ app: { open: (o?: OpenOptions) => Promise<void> } }>({
  app: async ({ page }, use) => {
    await use({ open: (o) => openApp(page, o) });
  },
});

export { expect };

declare global {
  interface Window {
    __YMD_MOCK__?: unknown;
  }
}
