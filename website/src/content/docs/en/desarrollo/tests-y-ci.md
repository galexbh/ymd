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

`ci.yml` validates every change; merging requires every job to pass. A `changes` job decides which areas a change touches with path filters:

| Filter      | Main paths                                                          | Jobs                                                     |
| ----------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| `rust`      | `src-tauri/**`                                                      | `rust` (fmt, clippy, tests on Windows, macOS and Linux)  |
| `frontend`  | `src/**`, `e2e/**`, `public/**`, Vite, TypeScript and Oxlint config | `frontend` (lint, types, unit with coverage, build, e2e) |
| `extension` | `extension/**`, `src/styles/**`                                     | `extension` (lint, unit, build, zip, e2e)                |
| `deps`      | `package.json`, `pnpm-lock.yaml`, `Cargo.toml`, `Cargo.lock`        | `audit` (pnpm audit and cargo audit)                     |
| `website`   | `website/**`, `CHANGELOG.md`, `docs/assets/**`                      | `docs` (builds the site and validates links)             |

- A change to `ci.yml` turns on every filter.
- `format` (oxfmt) always runs, since it covers the documentation too.
- On Linux, the `rust` job runs the tests with `cargo llvm-cov` instead of `cargo test`: the same suite, which also produces the coverage report (a summary in the run and the `rust-coverage` artifact, no threshold). Windows and macOS use `cargo test`.
- `build-check` builds the real app (frontend, extension and Tauri, debug and without installers) on Linux only, with its own Rust cache. The installers for all three OSes are built by `release.yml`.
- clippy, the tests and the CI builds use `--locked`: if `Cargo.lock` is out of date, CI fails instead of updating it.
- **On `main` everything runs**, regardless of paths. Same for manual runs (`workflow_dispatch`).
- A new push to a PR cancels that PR's previous run; on `main` every push finishes its run.

Skipped jobs count as passing for branch protection.

## Caches

GitHub limits cache to 10 GB per repository. Rust caches are saved from `main` only (PRs read them without overwriting) and there is one per purpose and OS: `debug` (the `rust` job), `build` (`build-check`) and `release-<os>` (installers).

A cache saved from a tag can only be read by that tag, so `release.yml` does not save its own: `warm-release-cache.yml` prepares it by building the same release binaries on `main` (same runners, targets and environment variables).

## Other workflows

| Workflow                 | When                                                                       | What it does                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `release.yml`            | `v*` tags                                                                  | Signed installers and a draft release (see [Releases](/ymd/en/desarrollo/releases/))                                   |
| `docs.yml`               | pushes to `main` touching `website/**`, `CHANGELOG.md` or `docs/assets/**` | Publishes this site to GitHub Pages                                                                                    |
| `nightly-smoke.yml`      | daily                                                                      | A real download with the nightly yt-dlp; opens an issue on failure (a YouTube “not a bot” check only leaves a warning) |
| `supported-sites.yml`    | weekly                                                                     | Refreshes the supported-sites list and opens a PR when it changed                                                      |
| `warm-release-cache.yml` | pushes to `main` touching `Cargo.lock` or `Cargo.toml`, weekly, manual     | Builds the release binaries without installers and saves the cache `release.yml` reads                                 |
| `cache-cleanup.yml`      | when a PR closes; daily; manual                                            | Deletes the closed PR's caches; on `main` keeps only the newest cache of each key group                                |
