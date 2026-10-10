---
title: Contributing
description: Setup, commands and project rules.
---

A summary of the contributing guide. The full version is in [CONTRIBUTING.md](https://github.com/galexbh/ymd/blob/main/CONTRIBUTING.md).

## The rule

**Every change ships with tests, and CI must be green.** No PR merges with red tests, without tests for new behavior, or with a failing CI job. If a test fails because of something you didn't touch, fix it or report it; don't disable it.

## Setup

Requirements: Node 22+, stable Rust (`rustup`) and, on Linux, the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/).

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

Before opening a PR: `pnpm check && pnpm test:rust && pnpm lint:rust`.

## Conventions

- **IPC contract:** a new command touches, in the same commit, `model.rs`, the Rust command, `src/ipc/types.ts`, `commands.ts` or `events.ts`, the fake backend and their tests. See [Architecture](/ymd/en/desarrollo/arquitectura/).
- **i18n:** Spanish and English with identical keys (a test checks it). No hard-coded strings in components.
- **Design:** components use tokens only (theme CSS variables); every visual change is checked in light and dark themes.
- **Security:** yt-dlp and the other tools always run with an argv list, never through a shell. No secrets on disk in plain text or in process arguments.
- **Commits:** imperative and concise. If an AI wrote or co-wrote the change, add the `Co-Authored-By` trailer.

## Documentation

This site lives in `website/` (Astro Starlight) and is published to GitHub Pages on merge to `main`. Every page has a Spanish version (root) and an English one (`en/`); a change in app behavior updates both.
