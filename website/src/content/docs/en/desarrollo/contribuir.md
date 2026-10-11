---
title: Contributing
description: Setup, commands and merge requirements.
---

A summary of the contributing guide. The full version is in [CONTRIBUTING.md](https://github.com/galexbh/ymd/blob/main/.github/CONTRIBUTING.md).

## Setup

Requirements: Node 24+, stable Rust (`rustup`) and, on Linux, the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/).

pnpm is used through corepack; the exact version is in `package.json` → `packageManager`.

```sh
corepack enable        # once (or "corepack pnpm ..." for every command)
pnpm install
pnpm tauri dev         # full desktop app (Rust + webview)
pnpm dev:mock          # UI only, at http://localhost:1420, with a fake backend
```

Mock mode runs the frontend against a stateful fake backend (`src/ipc/mock/`): dependencies, downloads with progress, history, settings, cookies and credentials, all in memory and offline. It takes URL parameters (`?scenario=first-run|ready|outdated|complete`, `speed=4`, `brave=closed`) and exposes `window.__YMD_MOCK__` in the console.

## Commands

| Command              | What it does                                     |
| -------------------- | ------------------------------------------------ |
| `pnpm check`         | lint + format + types + frontend tests           |
| `pnpm test:coverage` | Vitest with v8 coverage                          |
| `pnpm e2e`           | Playwright against `dev:mock`                    |
| `pnpm test:rust`     | `cargo test --features test-support`             |
| `pnpm lint:rust`     | `cargo fmt --check` + `cargo clippy -D warnings` |
| `pnpm ext:test`      | ymd Cookies extension tests                      |
| `pnpm docs:dev`      | This documentation site, in development mode     |
| `pnpm docs:build`    | Builds the site and validates its internal links |

Full local check: `pnpm check && pnpm test:rust && pnpm lint:rust`.

## Merge requirements

A PR is merged when it meets these requirements. The details are in [CONTRIBUTING.md](https://github.com/galexbh/ymd/blob/main/.github/CONTRIBUTING.md).

- **Tests and CI:** the change includes tests for new or modified behavior, and every CI job passes (see [Tests and CI](/ymd/en/desarrollo/tests-y-ci/)).
- **IPC contract:** commands and events stay in sync across `model.rs`, the Rust command, `src/ipc/types.ts`, `commands.ts` or `events.ts`, the mock backend and their tests (see [Architecture](/ymd/en/desarrollo/arquitectura/#ipc-contract)).
- **i18n:** Spanish and English with identical keys; components contain no hard-coded strings.
- **Design:** components use tokens only (theme CSS variables), and visual changes are checked in light and dark themes.
- **Security:** yt-dlp and the other tools run with an argv list, never through a shell. No secret is stored on disk in plain text or passed in process arguments.
- **Documentation:** user-visible changes are reflected in the Spanish and English pages.

## Documentation

This site lives in `website/` (Astro Starlight) and is published to GitHub Pages on every merge to `main`. Spanish pages are at the root and English pages under `en/`, with the same file names.
