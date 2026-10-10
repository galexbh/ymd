// Ajustes → Cuentas: the site picker, the supported-sites register and its layout.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const T0 = new Date("2026-10-08T15:00:00Z");

async function openAccounts(page: Page) {
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("settings-tab-accounts").click();
  await expect(page.getByTestId("cookie-guide")).toBeVisible();
}

/** No element in the page scrolls sideways. */
async function horizontalOverflow(page: Page) {
  return page.evaluate(() =>
    [document.scrollingElement, ...document.querySelectorAll("main, main *")]
      .filter((el): el is Element => !!el)
      .filter((el) => {
        const style = getComputedStyle(el);
        const scrolls = el === document.scrollingElement || /auto|scroll/.test(style.overflowX);
        return scrolls && el.scrollWidth > el.clientWidth + 1;
      })
      .map((el) => `${el.tagName}.${el.className}`),
  );
}

test("pick Vimeo with the keyboard and save it to the keychain", async ({ page, app }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await app.open({ scenario: "ready" });
  await openAccounts(page);

  const form = page.getByRole("form", { name: "Agregar cuenta" });
  const site = form.getByRole("combobox", { name: "Sitio" });
  await site.fill("vimeo");
  await expect(site).toHaveAttribute("aria-expanded", "true");
  await site.press("Enter");
  await expect(site).toHaveValue("vimeo");
  await form.getByLabel("Usuario").fill("ana@example.com");
  await form.getByLabel("Contraseña").fill("e2e-not-a-secret");
  await form.getByRole("button", { name: "Guardar cuenta" }).click();

  await expect(page.getByTestId("credential-vimeo")).toContainText("ana@example.com");
  const saved = await page.evaluate(() =>
    (window.__YMD_MOCK__ as { calls: { cmd: string; args?: { extractor?: string } }[] }).calls
      .filter((c) => c.cmd === "credentials_set")
      .map((c) => c.args?.extractor),
  );
  expect(saved).toEqual(["vimeo"]);
});

for (const width of [880, 1280]) {
  test(`cuentas never scrolls sideways at ${width}px, list open`, async ({ page, app }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await app.open({ scenario: "ready" });
    await openAccounts(page);
    await page.getByRole("button", { name: "Mostrar la lista" }).click();
    await expect(page.getByTestId("supported-row")).toHaveCount(25);
    await page.getByRole("radio", { name: "Roto" }).click();
    await page.getByRole("combobox", { name: "Sitio" }).fill("a");
    expect(await horizontalOverflow(page)).toEqual([]);
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`ajustes — cuentas — sitios — ${colorScheme}`, async ({ page, app }) => {
    // tall enough that the whole register page and the help fit in one frame
    await page.setViewportSize({ width: 1180, height: 1800 });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.clock.install({ time: T0 });
    await app.open({ scenario: "ready", speed: 1 });
    await page.clock.runFor(500);
    await openAccounts(page);
    await page.getByRole("button", { name: "Mostrar la lista" }).click();
    await page.getByRole("searchbox", { name: "Buscar sitio" }).fill("vi");
    const list = page.getByTestId("supported-sites");
    await list.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await expect(list).toHaveScreenshot(`ajustes-cuentas-sitios-${colorScheme}.png`);
    await expect(page.getByTestId("howto-more")).toHaveScreenshot(
      `ajustes-cuentas-ayuda-${colorScheme}.png`,
    );

    await page.setViewportSize({ width: 1180, height: 760 });

    const site = page.getByRole("combobox", { name: "Sitio" });
    await site.fill("you");
    await expect(page.getByText("YouTube no acepta contraseña en yt-dlp")).toBeVisible();
    await site.fill("vi");
    await site.press("ArrowDown");
    const form = page.getByRole("form", { name: "Agregar cuenta" });
    await form.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot(`ajustes-cuentas-picker-${colorScheme}.png`);
  });
}
