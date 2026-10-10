import { expect, test } from "./fixtures";

test.describe("flows", () => {
  test("first run → install → receive a video and a playlist → archived", async ({ page, app }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await app.open({ scenario: "first-run", speed: 16 });

    // onboarding inside the shell
    await expect(page.getByTestId("onboarding")).toBeVisible();
    await page.getByTestId("onboarding-install").click();
    await expect(page.getByTestId("onboarding-finish")).toBeEnabled({ timeout: 15_000 });
    await page.getByTestId("onboarding-finish").click();

    // the counter
    const url = page.getByTestId("home-url-input");
    await expect(url).toBeFocused();
    await url.fill("https://www.youtube.com/watch?v=e2eVideo001");
    await url.press("Enter");
    const rows = page.getByTestId(/^queue-item-/);
    await expect(rows).toHaveCount(1, { timeout: 10_000 });

    // a playlist: pick the first three entries
    await url.fill("https://www.youtube.com/playlist?list=PLe2eList01");
    await url.press("Enter");
    await expect(page.getByTestId("accession-card")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Ninguna" }).click();
    await page.getByRole("textbox", { name: "Primera entrada del rango" }).fill("1");
    await page.getByRole("textbox", { name: "Última entrada del rango" }).fill("3");
    await page.getByRole("button", { name: "Seleccionar rango" }).click();
    await expect(page.getByTestId("picker-count")).toContainText("3/12");
    await page.getByTestId("home-ingest").click();
    await expect(rows).toHaveCount(2);

    // both are stamped ARCHIVADO
    for (const i of [0, 1]) {
      await expect(rows.nth(i)).toHaveAttribute("data-stage", "done", { timeout: 60_000 });
    }
    await expect(rows.nth(0).getByText("Archivado")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a failed row explains the fix and routes to it", async ({ page, app }) => {
    await app.open({ scenario: "ready" });
    const url = page.getByTestId("home-url-input");
    await url.fill("https://www.youtube.com/watch?v=botcheck0001");
    await url.press("Enter");
    await expect(page.getByText("YouTube pide confirmar que no eres un bot")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Abrir Ajustes → Cuentas" }).click();
    await expect(page.getByTestId("cookie-guide")).toBeVisible();
  });

  test("catalog search narrows the ledger", async ({ page, app }) => {
    await app.open({ scenario: "ready" });
    await page.getByTestId("nav-catalog").click();
    const rows = page.getByTestId(/^catalog-row-/);
    await expect(rows).toHaveCount(20);
    await page.getByTestId("catalog-search").fill("jazz");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Morning Jazz Café");
  });

  test("keyboard: Ctrl+4 opens Dependencias, Ctrl+L returns to the counter", async ({
    page,
    app,
  }) => {
    await app.open({ scenario: "ready" });
    await page.keyboard.press("Control+4");
    await expect(page.getByRole("heading", { level: 1, name: "Dependencias" })).toBeVisible();
    await page.keyboard.press("Control+l");
    await expect(page.getByTestId("home-url-input")).toBeFocused();
  });
});
