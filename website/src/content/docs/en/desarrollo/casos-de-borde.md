---
title: Edge cases
description: Real problems solved while developing ymd, with their cause, their fix and where the code lives.
---

Real failures found while developing ymd, their cause and where the fix lives. Each case follows **Symptom → Cause → Fix → Where it lives**.

## Edge showed as “open” with no windows

- **Symptom:** when reading Edge's cookies, ymd asked to close it even though no window was open.
- **Cause:** Edge's Startup boost keeps the browser running in the background, and the cookie database stays locked meanwhile.
- **Fix:** since version 0.4.0, ymd doesn't read Chromium browsers directly: it uses the extension. On update, anyone who had one selected moves to **Extension** in **Cookie source**.
- **Where it lives:** `src/screens/settings/AccountsSettings.tsx`, migration in `sanitize` in `src-tauri/src/settings.rs`.

## yt-dlp can't decrypt Chrome cookies on Windows

- **Symptom:** with Chrome, Brave or Edge on Windows, yt-dlp fails to decrypt the cookies (“Failed to decrypt with DPAPI”).
- **Cause:** Chromium's app-bound encryption only lets the browser itself decrypt its cookies.
- **Fix:** the ymd Cookies extension reads the cookies from inside the browser and hands them to ymd over Native Messaging, with no network. See [Cookie bridge protocol](/ymd/en/desarrollo/puente-de-cookies/).
- **Where it lives:** `src-tauri/src/auth/native_host.rs`, `extension/src/lib/sync.ts`.

## yt-dlp overwrote freshly synced cookies

- **Symptom:** after a download, the cookies the extension had just sent went back to an old version.
- **Cause:** on exit, yt-dlp rewrites the file it got through `--cookies` with what it had in memory when it started.
- **Fix:** each download gets its own copy of the cookie file inside its temporary folder, deleted along with it.
- **Where it lives:** `ephemeral_copy` and `ephemeral_args` in `src-tauri/src/auth/cookies.rs`, used from `src-tauri/src/jobs.rs`.

## Cookies stored in plain text

- **Symptom:** the cookie file arriving through the extension was readable by any program running as the user.
- **Cause:** storing it as-is undid the protection Chromium gives its own cookies.
- **Fix:** the file is sealed with ChaCha20-Poly1305 and a random key kept in the system keychain. Without a keychain (Linux with no Secret Service), it stays an owner-only file and the log says so.
- **Where it lives:** `src-tauri/src/auth/jar.rs`.

## The browser never closed the pipe to ymd

- **Symptom:** after **Download with ymd**, the browser kept waiting for the bridge to close a pipe that never closed.
- **Cause:** on Windows, the ymd launched by the bridge inherited the bridge's standard input and output (the browser's pipes), so the browser never saw them close.
- **Fix:** before launching ymd, the bridge marks those handles as non-inheritable with `SetHandleInformation`.
- **Where it lives:** `src-tauri/src/open_url.rs`.

## The link was lost when the browser opened ymd

- **Symptom:** with ymd closed, **Download with ymd** opened the app but **Receive** stayed empty (in development).
- **Cause:** the link is taken from the backend only once, and in development React StrictMode mounts, unmounts and remounts effects: the first mount took it and lost it on unmount.
- **Fix:** the taken link waits at module level and whichever mount is still alive delivers it, once first-run setup is done.
- **Where it lives:** `src/store/clipboard.ts`.

## The context menu was missing on YouTube's video

- **Symptom:** **Download with ymd** showed on links and on the page, but not when right-clicking YouTube's player.
- **Cause:** Chrome matches `targetUrlPatterns` against the video's `srcUrl`, which on YouTube is a `blob:` URL, so the entry vanished.
- **Fix:** the entry only uses `documentUrlPatterns`, and `clickedLink` picks the right link: the clicked link, the selection or the page, skipping anything that isn't a web link.
- **Where it lives:** `extension/src/lib/sync.ts`, `extension/src/lib/links.ts`.

## Unpacked extensions don't update automatically

- **Symptom:** after updating ymd, the extension loaded in the browser stayed on its previous version.
- **Cause:** an extension loaded unpacked gets no automatic updates; it has to be reloaded by hand.
- **Fix:** the extension sends its version with every sync. When the one bundled with ymd is newer, the extension card asks to open the browser's extensions and click reload on ymd Cookies.
- **Where it lives:** `src/screens/settings/ExtensionCard.tsx`, `extensionOutdated` in `src/screens/settings/extension.ts`.

## YouTube asks to “confirm you're not a bot” in CI

- **Symptom:** the nightly test against real YouTube failed on GitHub runners with nothing changed in ymd.
- **Cause:** YouTube sometimes flags runner IPs and answers “Sign in to confirm you're not a bot”.
- **Fix:** that answer is reported as a warning (`::warning`) and the download checks are skipped; any other failure still breaks the job.
- **Where it lives:** `.github/workflows/nightly-smoke.yml`.

## Resuming downloads without storing secrets

- **Symptom:** quitting ymd mid-download lost those downloads; saving them as-is would have left video passwords or 2FA codes on disk.
- **Cause:** jobs lived only in memory, and their partial files depended on a per-job temporary folder.
- **Fix:** the `pending_jobs` table keeps each unfinished job with its same id, so **Resume** reuses `tmp/<id>` and yt-dlp continues from its `.part` files. Jobs that used a secret only store `needs_secret` and never resume automatically.
- **Where it lives:** `src-tauri/src/jobs.rs`, `src-tauri/src/history.rs`.

## The production minifier rejected a CSS selector

- **Symptom:** the open animation of dropdown lists worked in development, but didn't get through the production CSS minifier.
- **Cause:** the CSS minifier doesn't accept `::picker(select):popover-open`.
- **Fix:** the open state is written with `:open` on the `select` (`.select:open::picker(select)`).
- **Where it lives:** `src/ui/Field.module.css`.
