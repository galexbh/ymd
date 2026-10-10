import { defineConfig } from "@playwright/test";

const CI = !!process.env.CI;

// Loads the built extension (extension/dist, run `pnpm ext:build` first) into Playwright's
// Chromium with a persistent profile. One worker: the native host registration is per user.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "../test-results/extension",
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  reporter: CI
    ? [["github"], ["html", { open: "never", outputFolder: "../playwright-report/extension" }]]
    : [["list"]],
  use: {
    trace: "retain-on-failure",
  },
});
