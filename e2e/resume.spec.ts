import { expect, test } from "./fixtures";

test.describe("resume after restart", () => {
  test("an unfinished download comes back in the Registro and resumes with its number", async ({
    page,
    app,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // slow enough that the download is still running when ymd "closes"
    await app.open({ scenario: "ready", speed: 1 });

    const url = page.getByTestId("home-url-input");
    await url.fill("https://www.youtube.com/watch?v=e2eResume01");
    await url.press("Enter");
    const rows = page.getByTestId(/^queue-item-/);
    await expect(rows).toHaveCount(1, { timeout: 10_000 });
    const testId = await rows.first().getAttribute("data-testid");

    await page.evaluate(() => {
      (window.__YMD_MOCK__ as { simulateRestart: () => unknown }).simulateRestart();
    });
    await expect(rows).toHaveCount(0);

    await page.getByTestId("nav-queue").click();
    const notice = page.getByTestId("queue-pending");
    await expect(notice.getByText("Hay 1 descarga sin terminar")).toBeVisible();
    await notice.getByRole("button", { name: "Reanudar" }).click();

    await expect(notice).toHaveCount(0);
    await expect(page.getByTestId(testId!)).toBeVisible();
    expect(errors).toEqual([]);
  });
});
