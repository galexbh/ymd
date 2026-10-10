---
title: Tests and CI
description: Which tests exist, where they live and what each workflow runs.
---

## Where tests live

| Layer             | Where                                                 | Tooling                                                                             |
| ----------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Rust, unit        | next to the code (`#[cfg(test)] mod tests`)           | `cargo test`, `insta` for argv snapshots                                            |
| Rust, integration | `src-tauri/tests/*.rs`                                | fake yt-dlp, `httpmock`, `tempfile`                                                 |
| Rust, real smoke  | `#[ignore]` tests named `smoke_*`                     | only in `nightly-smoke.yml`                                                         |
| Frontend          | `src/**/__tests__/*.test.ts(x)` or next to the module | Vitest + Testing Library + mock backend                                             |
| Invariants        | `src/i18n`, `src/theme`                               | Vitest: identical es/en keys, AA contrast, tokens                                   |
| UI end-to-end     | `e2e/*.spec.ts`                                       | Playwright + mock backend                                                           |
| Extension         | `extension/src/**/__tests__`, `extension/e2e`         | Vitest with a fake `chrome.*`; Playwright with real Chromium and a fake native host |
| Documentation     | `website/`                                            | `pnpm docs:build` with internal link validation                                     |

## CI (`ci.yml`)

The gate for every change: nothing merges unless every job is green. A `changes` job decides which areas a change touches with path filters:

| Filter      | Main paths                                                          | Jobs                                                     |
| ----------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| `rust`      | `src-tauri/**`                                                      | `rust` (fmt, clippy, tests on Windows, macOS and Linux)  |
| `frontend`  | `src/**`, `e2e/**`, `public/**`, Vite, TypeScript and ESLint config | `frontend` (lint, types, unit with coverage, build, e2e) |
| `extension` | `extension/**`, `src/styles/**`                                     | `extension` (lint, unit, build, zip, e2e)                |
| `deps`      | `package.json`, `pnpm-lock.yaml`, `Cargo.toml`, `Cargo.lock`        | `audit` (pnpm audit and cargo audit)                     |
| `website`   | `website/**`, `CHANGELOG.md`, `docs/assets/**`                      | `docs` (builds the site and validates links)             |

- A change to `ci.yml` turns on every filter.
- `format` (Prettier) always runs, since it covers the documentation too.
- `build-check` builds the real app (frontend, extension and Tauri) on Linux for PRs that touch the app.
- **On `main` everything runs**, regardless of paths: all three OSes in `build-check` and the Rust coverage report. Same for manual runs (`workflow_dispatch`).

Skipped jobs count as passing for branch protection.

## Other workflows

| Workflow              | When                                                                       | What it does                                                                         |
| --------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `release.yml`         | `v*` tags                                                                  | Signed installers and a draft release (see [Releases](/ymd/en/desarrollo/releases/)) |
| `docs.yml`            | pushes to `main` touching `website/**`, `CHANGELOG.md` or `docs/assets/**` | Publishes this site to GitHub Pages                                                  |
| `nightly-smoke.yml`   | daily                                                                      | A real download with the nightly yt-dlp; opens an issue on failure                   |
| `supported-sites.yml` | weekly                                                                     | Refreshes the supported-sites list and opens a PR when it changed                    |
