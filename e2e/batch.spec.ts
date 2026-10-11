import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** Paste text into the counter the way the clipboard does (raw, newlines included). */
async function paste(page: Page, text: string) {
  await page.getByTestId("home-url-input").evaluate((el, value) => {
    const dt = new DataTransfer();
    dt.setData("text", value);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
  }, text);
}

test.describe("several links at once", () => {
  test("pasting three links files three jobs, seen in the queue", async ({ page, app }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await app.open({ scenario: "ready" });

    const links = [
      "https://www.youtube.com/watch?v=e2eBatch0001",
      "https://www.youtube.com/watch?v=e2eBatch0002",
      "https://vimeo.com/987654321",
    ];
    await paste(page, `${links.join("\n")}\nnot a link`);

    const panel = page.getByTestId("batch-panel");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("home-url-input")).toHaveValue("");
    await expect(panel.getByTestId("batch-link")).toHaveCount(3);
    await expect(panel.getByTestId("batch-excluded")).toHaveCount(3);

    await page.getByTestId("batch-enqueue").click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId("home-url-input")).toBeFocused();

    await page.getByTestId("nav-queue").click();
    await expect(page.getByTestId(/^queue-item-/)).toHaveCount(3, { timeout: 10_000 });
    expect(errors).toEqual([]);
  });
});
