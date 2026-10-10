// Cookie bridge card (Ajustes → Cuentas): a sync delivered by the extension turns it CONECTADA.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const T0 = new Date("2026-10-08T15:00:00Z");

interface MockBridge {
  simulateExtensionSync(browser: string, count: number, domains: string[]): unknown;
}

async function openAccounts(page: Page) {
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("settings-tab-accounts").click();
}

test("a sync from the extension turns the card CONECTADA and adopts the file", async ({
  page,
  app,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: T0 });
  await app.open({ scenario: "ready", ext: "none" });
  await openAccounts(page);

  const card = page.getByTestId("extension-card");
  const stamp = card.getByTestId("extension-stamp");
  await expect(stamp).toContainText("Pendiente");
  await expect(card).toHaveAttribute("data-prominent", "true");

  await page.evaluate(() => {
    const mock = window.__YMD_MOCK__ as MockBridge;
    mock.simulateExtensionSync("brave", 42, [".youtube.com", ".google.com"]);
  });
  await page.clock.runFor(5500);

  await expect(stamp).toContainText("Conectada");
  await expect(card.getByText("Brave conectado: 42 cookies sincronizadas")).toBeVisible();
  await expect(card.getByTestId("extension-sync")).toContainText("42");
  await expect(page.getByRole("radio", { name: "Archivo cookies.txt" })).toBeChecked();
  await expect(page.getByTestId("cookie-info")).toContainText("extension:brave");
});

test("Cuentas with the extension card never scrolls sideways at 880px", async ({ page, app }) => {
  await page.setViewportSize({ width: 880, height: 800 });
  await page.clock.install({ time: T0 });
  await app.open({ scenario: "ready", ext: "synced" });
  await openAccounts(page);
  await expect(page.getByTestId("extension-stamp")).toContainText("Conectada");
  const overflow = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("main, main *")) {
      const style = getComputedStyle(el);
      const scrolls = style.overflowX === "auto" || style.overflowX === "scroll";
      if (scrolls && el.scrollWidth > el.clientWidth + 1) out.push(el.className);
    }
    const root = document.scrollingElement!;
    if (root.scrollWidth > root.clientWidth + 1) out.push("document");
    return out;
  });
  expect(overflow).toEqual([]);
});
