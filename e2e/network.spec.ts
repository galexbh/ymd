import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** The part of the mock's settings this spec reads. */
interface MockSettings {
  limitRateMbps: number | null;
  network: {
    proxy: string | null;
    ipVersion: string;
    socketTimeoutS: number | null;
    retries: number | null;
  };
}

const settings = (page: Page) =>
  page.evaluate(
    () =>
      (window.__YMD_MOCK__ as { snapshot: () => { settings: MockSettings } }).snapshot().settings,
  );

test.describe("Ajustes → Red", () => {
  test("saves a valid proxy, rejects one with credentials, forces IPv4 and holds the speed limit", async ({
    page,
    app,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await app.open({ scenario: "ready" });
    await page.getByTestId("nav-settings").click();

    // The speed limit moved out of Descargas.
    await page.getByTestId("settings-tab-downloads").click();
    await expect(page.getByTestId("settings-limit-rate")).toHaveCount(0);

    await page.getByTestId("settings-tab-network").click();
    const proxy = page.getByTestId("settings-proxy");
    await expect(proxy).toHaveAttribute("placeholder", "socks5://127.0.0.1:1080");

    await proxy.fill("socks5h://127.0.0.1:1080");
    await proxy.press("Enter");
    await expect
      .poll(async () => (await settings(page)).network.proxy)
      .toBe("socks5h://127.0.0.1:1080");

    await proxy.fill("http://u:p@host");
    await proxy.blur();
    await expect(proxy).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText(/no guarda usuario ni contraseña del proxy/)).toBeVisible();
    // The address with credentials never reaches the settings; the last valid one stays.
    await expect
      .poll(async () => (await settings(page)).network.proxy)
      .toBe("socks5h://127.0.0.1:1080");
    expect(JSON.stringify(await settings(page))).not.toContain("u:p@");

    await page.getByRole("radio", { name: "Solo IPv4" }).click();
    await expect.poll(async () => (await settings(page)).network.ipVersion).toBe("v4");

    const limit = page.getByTestId("settings-limit-rate");
    await expect(limit).toBeVisible();
    await limit.selectOption("10");
    await expect.poll(async () => (await settings(page)).limitRateMbps).toBe(10);

    // Survives a trip through another section.
    await page.getByTestId("settings-tab-accounts").click();
    await page.getByTestId("settings-tab-network").click();
    await expect(page.getByRole("radio", { name: "Solo IPv4" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByTestId("settings-limit-rate")).toHaveValue("10");
    expect(errors).toEqual([]);
  });
});
