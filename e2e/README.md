# E2E tests (Playwright)

The real frontend runs in Chromium against the **mock backend** (`pnpm dev:mock`, i.e.
`vite --mode mock`). No Tauri, no Rust, no network. Playwright starts the dev server itself
(`playwright.config.ts` → `webServer`, port 1420). If that port is taken (e.g. by `pnpm tauri
dev`), run with `E2E_PORT=1437`; set `E2E_REUSE=1` to reuse a `pnpm dev:mock` you already have
running.

```sh
corepack pnpm e2e:install   # once: download Chromium
corepack pnpm e2e           # run
corepack pnpm e2e:update    # accept new visual snapshots (review the diff first!)
```

## Conventions

- **Import from `./fixtures`**, not `@playwright/test`. The `app` fixture opens the app with a
  backend scenario: `await app.open({ scenario: "first-run", speed: 8, braveClosed: true })`.
  Scenarios: `first-run` (nothing installed), `ready` (yt-dlp + ffmpeg, Node detected),
  `outdated` (yt-dlp update available), `complete` (everything installed).
- **Selectors**: prefer roles and accessible names (`getByRole("button", { name: /descargar/i })`).
  When a stable hook is needed use `data-testid` in kebab-case, `<screen>-<element>[-<qualifier>]`:
  `home-url-input`, `queue-item-<jobId>`, `deps-row-ytdlp`, `deps-install-ffmpeg`,
  `settings-theme-dark`. Never select by CSS class or text that is translated unless the test
  sets the language explicitly.
- **Language**: the browser locale is `es-HN`. Tests that assert copy must pin the language
  (settings `language`) so they don't depend on the default.
- **Mock control**: the live backend is exposed as `window.__YMD_MOCK__` (a `MockBackend`).
  Use `page.evaluate(() => window.__YMD_MOCK__.setBrowserRunning("brave", false))` etc. for
  state changes mid-test. Failure URLs: `...bot...` → `bot_check`, `...private...` → `private`,
  `...age...` → `age_restricted`, `...geo...` → `geoblocked`; probe fails for `...notfound...`
  (`unavailable`) and `...offline...` (`network`); playlists: URLs with `list=` / `/playlist`.
- **Speed**: pass `speed` (default 8) so downloads finish in a few seconds. Don't use fixed
  `waitForTimeout`; wait for UI state (`expect(...).toHaveText(...)`).

## Visual snapshots (light / dark)

Each screen gets one snapshot per theme. Use `page.emulateMedia({ colorScheme })` with the
theme mode left on `system`, and name snapshots `<screen>-<state>-<theme>.png`:

```ts
for (const colorScheme of ["light", "dark"] as const) {
  test(`deps screen — ${colorScheme}`, async ({ page, app }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await app.open({ scenario: "first-run" });
    await expect(page).toHaveScreenshot(`deps-first-run-${colorScheme}.png`, { fullPage: true });
  });
}
```

Snapshots live in `e2e/__screenshots__/` and are committed. Mock thumbnails are generated SVGs
and data is deterministic, so screenshots are stable; mask anything time-dependent (relative
dates, speeds) with `mask: [locator]`. Baselines are generated on Linux in CI — if you update
them on Windows/macOS expect font differences; prefer regenerating from the CI artifact.
