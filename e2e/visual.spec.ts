// Visual snapshots of the first viewport (Recibir) and Ajustes, in both themes.
// The page clock is faked so the mock's simulated downloads stop at the same instant every run.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const T0 = new Date("2026-10-08T15:00:00Z");

async function fileLink(page: Page, url: string) {
  const input = page.getByTestId("home-url-input");
  await input.fill(url);
  await input.press("Enter");
  await page.clock.runFor(1100);
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`recibir — busy ledger — ${colorScheme}`, async ({ page, app }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.clock.install({ time: T0 });
    await app.open({ scenario: "ready", speed: 1 });
    await page.clock.runFor(500);

    await page.getByRole("radio", { name: "Audio" }).click();
    await fileLink(page, "https://www.youtube.com/watch?v=lofiAudio01");
    await page.clock.runFor(8000);
    await page.getByRole("radio", { name: "Video" }).click();
    await fileLink(page, "https://www.youtube.com/watch?v=botcheck123");
    await fileLink(page, "https://www.youtube.com/watch?v=volcanes0001");
    await page.clock.runFor(2500);
    // a probed link waiting at the counter
    const input = page.getByTestId("home-url-input");
    await input.fill("https://www.youtube.com/watch?v=rustOwner77");
    await page.getByTestId("home-url-input").evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData("text", (el as HTMLInputElement).value);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
    });
    await page.clock.runFor(1000);
    await expect(page.getByTestId("accession-card")).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot(`recibir-busy-${colorScheme}.png`);
  });

  test(`ajustes — apariencia — ${colorScheme}`, async ({ page, app }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.clock.install({ time: T0 });
    await app.open({ scenario: "ready", speed: 1 });
    await page.clock.runFor(500);
    await page.getByTestId("nav-settings").click();
    await page.getByTestId("settings-tab-appearance").click();
    await expect(page.getByTestId("appearance-preview")).toBeVisible();
    await expect(page).toHaveScreenshot(`ajustes-apariencia-${colorScheme}.png`);
  });

  test(`ajustes — cuentas — ${colorScheme}`, async ({ page, app }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.clock.install({ time: T0 });
    await app.open({ scenario: "ready", speed: 1 });
    await page.clock.runFor(500);
    await page.getByTestId("nav-settings").click();
    await page.getByTestId("settings-tab-accounts").click();
    await expect(page.getByTestId("cookie-guide")).toBeVisible();
    await page.clock.runFor(500);
    await expect(page).toHaveScreenshot(`ajustes-cuentas-${colorScheme}.png`);
  });
}

test("switching the theme in Ajustes repaints immediately", async ({ page, app }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await app.open({ scenario: "ready" });
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("settings-tab-appearance").click();
  await page.getByRole("radio", { name: "Oscuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("radio", { name: "Claro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
