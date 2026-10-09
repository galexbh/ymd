import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;
// 1420 is Tauri's dev port. Set E2E_PORT to run beside another dev server, and E2E_REUSE=1 to
// reuse an already running `pnpm dev:mock` (never reuse blindly: a plain `pnpm dev` on the
// same port has no mock backend).
const PORT = Number(process.env.E2E_PORT ?? 1420);
const REUSE = process.env.E2E_REUSE === "1";

// E2E runs the real frontend in a plain browser against the mock backend (`vite --mode mock`).
// See e2e/README.md for conventions.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" },
  },
  // Fonts render differently per OS, so baselines are per platform. A platform without
  // baselines (e.g. the first Linux CI run) records them instead of failing; CI uploads them
  // as an artifact so they can be committed.
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{platform}/{testFilePath}/{arg}-{projectName}{ext}",
  updateSnapshots: "missing",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1180, height: 760 },
    locale: "es-HN",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1180, height: 760 } },
    },
  ],
  webServer: {
    // In CI pnpm is installed by pnpm/action-setup; locally it is reached through corepack.
    command: `${CI ? "pnpm" : "corepack pnpm"} dev:mock --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: REUSE && !CI,
    timeout: 120_000,
    env: { COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
  },
});
