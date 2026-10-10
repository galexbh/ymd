# CLAUDE.md

Guidance for AI coding sessions in this repo. Product context: `PRODUCT.md`. Human guide:
`CONTRIBUTING.md`.

## Stack

ymd = desktop GUI for yt-dlp. Tauri v2 (Rust, `src-tauri/`) + React 18 + TypeScript + Vite,
zustand, i18next. pnpm via corepack (`corepack pnpm …`; set `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`
in non-interactive shells). Node 22+.

## Commands

```sh
corepack pnpm install
corepack pnpm dev:mock          # browser-only, fake backend (src/ipc/mock), port 1420
corepack pnpm tauri dev         # full app
corepack pnpm check             # lint + format:check + typecheck + vitest
corepack pnpm test:coverage     # vitest + v8 coverage (80% lines on pure modules)
corepack pnpm e2e               # Playwright vs dev:mock (e2e:install once)
corepack pnpm test:rust         # cargo test --features test-support
corepack pnpm lint:rust         # cargo fmt --check + clippy -D warnings
corepack pnpm docs:dev          # docs site (website/, Astro Starlight)
corepack pnpm docs:build        # build docs + validate internal links
```

Rust needs `dist/` to exist (`generate_context!`): run `pnpm build` or create `dist/index.html`.

## Architecture map

- `src-tauri/src/`
  - `model.rs` — every IPC type (serde, camelCase). **Source of truth of the contract.**
  - `commands/` — thin `#[tauri::command]` layer (deps, jobs, history, settings, auth).
  - `deps/` — managed binaries: `catalog.rs` (pure: assets per OS/arch), `manager.rs`
    (download, SHA-256 verify, atomic swap), `jsruntime.rs` (deno/node/bun/quickjs detection).
  - `ytdlp/` — `args.rs` (pure argv builder, insta snapshots), `progress.rs` (stdout marker
    parser), `errors.rs` (stderr → `ErrorCode`), `probe.rs` (`-J` → `ProbeResult`).
  - `jobs.rs` (queue, semaphore, cancel = kill tree), `history.rs` (SQLite),
    `settings.rs` (JSON + sanitize), `auth/` (browsers, cookies, keychain, netrc helper),
    `paths.rs`, `process.rs` (spawn without console / process group), `state.rs`.
  - `tests/` — integration tests; `tests/support/fake_ytdlp.rs` = fake yt-dlp bin
    (`test-support` feature; env `FAKE_YTDLP_SCENARIO` / `FAKE_YTDLP_SCRIPT` / `FAKE_YTDLP_ARGV_FILE`).
- `src/`
  - `ipc/types.ts` (mirror of `model.rs`), `ipc/commands.ts` (only place calling `invoke`),
    `ipc/events.ts` (typed `listen`), `ipc/mock/` (stateful fake backend, see below).
  - `screens/`, `ui/`, `store/`, `theme/`, `styles/`, `i18n/` — UI layers.
  - `test/setup.ts` — Vitest setup (jest-dom, jsdom polyfills, Tauri mock reset).
- `e2e/` — Playwright specs + `fixtures.ts`; conventions in `e2e/README.md`.
- `website/` — user and developer docs (Astro Starlight, GitHub Pages at
  `https://galexbh.github.io/ymd/`). Spanish pages at the root of `src/content/docs/`, English
  under `en/` with the same file names. The cookie bridge contract lives in
  `src/content/docs/{,en/}desarrollo/puente-de-cookies.md` (its key block is read by
  `extension/src/__tests__/manifest.test.ts`). The changelog page renders the root `CHANGELOG.md`.
  `docs/assets/` only holds README images.
- `.github/workflows/` — `ci.yml` (gate), `release.yml` (tags `v*`), `docs.yml` (Pages deploy),
  `nightly-smoke.yml`.

### Mock backend

`installMockBackend({ scenario, clock: "manual" | "real", speed, delays, failDeps, braveRunning,
platform, settings, seedHistory })` installs `mockIPC` + event mocking and returns a
`MockBackend` (`manualClock.advance/advanceAsync`, `setScenario`, `setBrowserRunning`,
`setDepFails`, `snapshot()`, `calls`, `events`). `resetMockBackend()` runs after every test.
Scenarios: `first-run`, `ready`, `outdated`, `complete`.

## Rules

1. **Contract sync**: changing an IPC type/command/event means updating, in the same commit,
   `model.rs`, `types.ts`, `commands.ts`/`events.ts`, `src/ipc/mock/backend.ts`, and tests.
2. **Testing**: every change adds or updates tests. Never finish a task with red tests, lint
   errors or type errors. Run `pnpm check` (+ `pnpm test:rust` for Rust changes) before saying
   done. Don't skip/disable tests to get green.
3. **Design**: follow `PRODUCT.md`, `DESIGN.md` (once it exists) and `.impeccable/`. UI uses
   design tokens only (no raw hex/rgb in components); verify light and dark themes; es/en i18n
   keys must be identical; no hard-coded user-facing strings.
4. **Security**: spawn tools with an argv list only, never a shell. No secrets on disk in
   plaintext or in process arguments (keychain + `--netrc-cmd`; video password / 2FA in memory
   only). ymd's cookies file must be owner-only (0600 / user ACL). Never commit binaries,
   cookies or credentials.
5. **Formatting**: Prettier for TS/JSON/MD/YAML, rustfmt for Rust; LF line endings.
6. Keep `@tauri-apps/*` npm packages on the same major.minor as the Rust crates.
7. **Docs**: a user-visible behavior change updates the matching `website/` page in both es and
   en, using the app's real UI labels (`src/i18n/*.json`). `pnpm docs:build` must pass (it fails
   on broken internal links).
