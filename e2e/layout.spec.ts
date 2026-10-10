// Layout across window sizes: data screens use the whole width and no ledger scrolls
// sideways (hidden tooltips once pushed a phantom horizontal scrollbar onto the ledger).
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const T0 = new Date("2026-10-08T15:00:00Z");
const WIDTHS = [880, 1280, 1600, 1920, 2560];

async function busyLedger(page: Page) {
  await page.getByRole("radio", { name: "Audio" }).click();
  for (const id of ["lofiAudio01", "lofiAudio02", "lofiAudio03"]) {
    const input = page.getByTestId("home-url-input");
    await input.fill(`https://www.youtube.com/watch?v=${id}`);
    await input.press("Enter");
    await page.clock.runFor(1100);
  }
  await page.clock.runFor(8000);
}

for (const width of WIDTHS) {
  test(`ledger never scrolls sideways and fills the window at ${width}px`, async ({
    page,
    app,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install({ time: T0 });
    await app.open({ scenario: "ready", speed: 1 });
    await page.clock.runFor(500);
    await busyLedger(page);

    const metrics = await page.evaluate(() =>
      [...document.querySelectorAll("table")].map((t) => {
        const box = t.parentElement as HTMLElement;
        return { scroll: box.scrollWidth, client: box.clientWidth };
      }),
    );
    expect(metrics.length).toBeGreaterThan(0);
    for (const m of metrics) expect(m.scroll).toBeLessThanOrEqual(m.client);

    // the ledger reaches the right edge of the content area (no fixed max width)
    const gap = await page.evaluate(() => {
      const table = document.querySelector("table") as HTMLElement;
      return window.innerWidth - table.getBoundingClientRect().right;
    });
    expect(gap).toBeLessThan(64);
  });
}

for (const width of [1920, 2560]) {
  test(`recibir — wide window ${width}px`, async ({ page, app }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.clock.install({ time: T0 });
    await app.open({ scenario: "ready", speed: 1 });
    await page.clock.runFor(500);
    await busyLedger(page);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot(`recibir-wide-${width}.png`);
  });
}
