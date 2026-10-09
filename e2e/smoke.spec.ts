import { expect, test } from "./fixtures";

type TauriWindow = Window & {
  __TAURI_INTERNALS__: { invoke: (cmd: string, args?: unknown) => Promise<unknown> };
};

test.describe("smoke", () => {
  test("app boots in mock mode", async ({ page, app }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await app.open({ scenario: "ready" });

    await expect(page).toHaveTitle(/\S/);
    await expect(page.locator("#root")).not.toBeEmpty();
    expect(errors).toEqual([]);
  });

  test("mock backend answers IPC from the page", async ({ page, app }) => {
    await app.open({ scenario: "first-run" });
    const states = await page.evaluate(async () => {
      const report = (await (window as unknown as TauriWindow).__TAURI_INTERNALS__.invoke(
        "deps_report",
        { checkLatest: false },
      )) as { deps: { state: string }[] };
      return report.deps.map((d) => d.state);
    });
    expect(states).toEqual(["missing", "missing", "missing", "missing", "missing"]);
  });
});
