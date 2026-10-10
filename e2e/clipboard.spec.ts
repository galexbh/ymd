import { expect, test } from "./fixtures";

test.describe("clipboard", () => {
  test("a copied YouTube link is picked up when the window gets focus", async ({ page, app }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await app.open();
    await expect(page.getByTestId("home-url-input")).toHaveValue("");

    const link = "https://www.youtube.com/watch?v=e2eClip0001&si=copied";
    await page.evaluate((text) => {
      (window.__YMD_MOCK__ as { setClipboard: (t: string) => void }).setClipboard(text);
      window.dispatchEvent(new Event("focus"));
    }, link);

    await expect(page.getByTestId("home-url-input")).toHaveValue(link);
    await expect(page.getByTestId("clipboard-offer")).toContainText(
      "Enlace de YouTube detectado en el portapapeles",
    );
    await expect(page.getByTestId("accession-card")).toBeVisible({ timeout: 10_000 });

    // Deshacer leaves an empty counter
    await page.getByTestId("clipboard-offer").getByRole("button", { name: "Deshacer" }).click();
    await expect(page.getByTestId("home-url-input")).toHaveValue("");
    await expect(page.getByTestId("accession-card")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
