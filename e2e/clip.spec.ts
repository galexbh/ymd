// «Tramo»: download only a time range of a single video.
import { expect, test } from "./fixtures";

test.describe("tramo", () => {
  test("an invalid range blocks Descargar; a valid one files the section with its tag", async ({
    page,
    app,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await app.open({ scenario: "ready", speed: 16 });

    // a pasted link is checked and waits at the counter (Enter would file it right away)
    const url = page.getByTestId("home-url-input");
    await url.fill("https://www.youtube.com/watch?v=e2eClip0001");
    await url.evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData("text", (el as HTMLInputElement).value);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
    });
    const card = page.getByTestId("accession-card");
    await expect(card).toBeVisible({ timeout: 10_000 });

    // «Tramo» starts closed: open it before typing
    const summary = card.getByTestId("clip-summary");
    await expect(card.getByTestId("clip-fields")).not.toHaveAttribute("open");
    await summary.click();
    const tramo = card.getByRole("group", { name: "Tramo" });
    const from = tramo.getByRole("textbox", { name: "Desde" });
    const to = tramo.getByRole("textbox", { name: "Hasta" });
    await expect(from).toHaveAttribute("placeholder", "0:00");

    // the end before the start
    await from.fill("1:30");
    await to.fill("1:00");
    await expect(tramo.getByText("«Hasta» tiene que ir después de «Desde».")).toBeVisible();
    await expect(to).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("home-ingest")).toBeDisabled();
    // Enter does not file it either
    await to.press("Enter");
    await expect(page.getByTestId(/^queue-item-/)).toHaveCount(0);

    await to.fill("1:45");
    await expect(to).not.toHaveAttribute("aria-invalid", "true");
    await expect(summary).toHaveText("Tramo · 1:30–1:45");
    await page.getByTestId("home-ingest").click();

    const row = page.getByTestId(/^queue-item-/);
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId("job-clip")).toHaveText("1:30–1:45");
    await expect(row).toHaveAttribute("data-stage", "done", { timeout: 60_000 });
    expect(errors).toEqual([]);
  });

  test("not offered for playlists", async ({ page, app }) => {
    await app.open({ scenario: "ready" });
    const url = page.getByTestId("home-url-input");
    await url.fill("https://www.youtube.com/playlist?list=PLe2eClip01");
    await url.press("Enter");
    await expect(page.getByTestId("accession-card")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("region", { name: "Entradas de la lista" })).toBeVisible();
    await expect(page.getByTestId("clip-fields")).toHaveCount(0);
  });
});
