---
title: Architecture
description: Rust modules, frontend, IPC contract and mock backend.
tableOfContents: false
---

ymd is a [Tauri 2](https://v2.tauri.app/) app: a Rust backend (`src-tauri/`) and a React 19 + TypeScript UI (`src/`) talking over IPC.

<figure class="archify-figure">
  <iframe data-archify="/ymd/diagramas/en/architecture.html" title="ymd architecture diagram" loading="lazy"></iframe>
  <figcaption>How a link travels from the interface to yt-dlp, and where ymd keeps each thing. <a href="/ymd/diagramas/en/architecture.html" target="_blank" rel="noopener">Open the interactive diagram</a></figcaption>
</figure>

| Path         | Contents                                                              |
| ------------ | --------------------------------------------------------------------- |
| `src/`       | UI (React 19, TypeScript, Vite, zustand, i18next)                     |
| `src-tauri/` | Backend (Rust, Tauri 2): queue, dependencies, authentication, history |
| `extension/` | ymd Cookies extension (Manifest V3)                                   |
| `e2e/`       | End-to-end tests (Playwright)                                         |
| `website/`   | This documentation site (Astro Starlight)                             |

## Backend (`src-tauri/src/`)

- **`model.rs`**: every IPC type (serde, camelCase). The source of truth of the contract.
- **`commands/`**: a thin `#[tauri::command]` layer (dependencies, jobs, history, settings, auth).
- **`deps/`**: managed tools.
  - `catalog.rs`: pure data; which asset to download per OS and architecture, and how to verify it.
  - `manager.rs`: download, SHA-256 verification and atomic swap.
  - `jsruntime.rs`: Deno, Node, Bun and QuickJS detection.
- **`ytdlp/`**: yt-dlp integration.
  - `args.rs`: builds the argv list (a pure function, with `insta` snapshots).
  - `progress.rs`: parses the progress markers on standard output.
  - `errors.rs`: maps stderr to an `ErrorCode` (see [Troubleshooting](/ymd/en/solucion-de-problemas/)).
  - `probe.rs`: turns `-J` output into the link's card.
- **`jobs.rs`**: the FIFO queue, with a limit on simultaneous downloads (1 to 8); cancel kills the process tree. See the [download lifecycle](#download-lifecycle).
- **`history.rs`**: the catalog, in SQLite.
- **`settings.rs`**: JSON settings, sanitized on read.
- **`auth/`**: browsers and profiles, cookies, system keychain, the `--netrc-cmd` helper, and the [cookie bridge](/ymd/en/desarrollo/puente-de-cookies/) native host with its browser registration.
- **`paths.rs`**, **`process.rs`** (console-less processes in their own group), **`state.rs`**.

## Download lifecycle

Every queued job goes through these stages (`JobStage` in `model.rs`). Merging and Processing only show up when needed.

<figure class="archify-figure">
  <iframe data-archify="/ymd/diagramas/en/download-lifecycle.html" title="Download state diagram" loading="lazy"></iframe>
  <figcaption>Retry doesn't revive the job: it enqueues a new one with the same request. <a href="/ymd/diagramas/en/download-lifecycle.html" target="_blank" rel="noopener">Open the interactive diagram</a></figcaption>
</figure>

## Frontend (`src/`)

- **`ipc/`**: `types.ts` (mirror of `model.rs`), `commands.ts` (the only place that calls `invoke`), `events.ts` (typed `listen`) and `mock/` (fake backend).
- **`screens/`**: Receive, Ledger, Catalog, Dependencies, Settings and the welcome screen.
- **`ui/`**: primitive components. **`store/`**: zustand state. **`theme/`** and **`styles/`**: design tokens and themes. **`i18n/`**: Spanish and English strings.

## IPC contract

A new command or event lands in a single commit:

1. `src-tauri/src/model.rs`: serde types (camelCase).
2. `src-tauri/src/commands/*.rs`: the `#[tauri::command]` and its registration in `lib.rs`.
3. `src/ipc/types.ts`: the TypeScript mirror of the types.
4. `src/ipc/commands.ts` (or `events.ts`): the typed wrapper.
5. `src/ipc/mock/backend.ts`: its fake-backend implementation; without it, mock mode and tests fail with `unhandled command`.
6. Tests: Rust for the logic, a mock test and the tests of the screen that uses it.

## Mock backend

`src/ipc/mock/` implements the whole contract in memory. `pnpm dev:mock`, the Vitest tests and the Playwright e2e tests all use it.

```ts
import { installMockBackend } from "../ipc/mock";
const be = installMockBackend({ scenario: "first-run", clock: "manual" });
// ... render, click "Install" ...
await be.manualClock.advanceAsync(2000);
```

Scenarios: `first-run`, `ready`, `outdated`, `complete`. URLs containing `bot`, `private`, `age` or `geo` fail with the matching error; `notfound` and `offline` fail when the link is checked.

On the Rust side, integration tests use a fake yt-dlp (`src-tauri/tests/support/fake_ytdlp.rs`, `test-support` feature) driven by environment variables.
