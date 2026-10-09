# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Desktop app delivered as a Tauri v2 webview (React + TypeScript) on Windows, macOS and Linux. Mobile is out of scope.

## Users

The primary user is a person who regularly saves video and music from the web (YouTube first, plus any site yt-dlp supports) to their own computer. They know what yt-dlp is, or would use it if they didn't have to memorize flags. Typical moments:

- Paste a link, pick "video" or "audio" and a quality, and move on.
- Queue up a whole playlist and let it run in the background.
- Come back later to find a file they downloaded earlier.

The owner's own setup is Windows with the Brave browser.

## Product Purpose

ymd is a desktop front end for yt-dlp that turns its command line into a calm, reliable tool. It installs and keeps yt-dlp and its dependencies up to date by itself, downloads video or audio with live progress, and remembers what was downloaded. Success means the user never opens a terminal, never hunts for a binary, and never has to guess why a download failed.

## Positioning

ymd owns the whole yt-dlp toolchain:

- It installs yt-dlp, ffmpeg/ffprobe, a JS runtime (Deno) and the optional helpers (aria2c, AtomicParsley) into a per-user folder, verifies their checksums, and updates them automatically.
- It translates yt-dlp's raw errors into actions the user can take, such as "close Brave and retry" or "use your browser cookies".
- Authentication works through browser cookies and the OS keychain, never through stored plaintext passwords.

## Operating Context

- A desktop window that sits open while downloads run, often alongside a browser.
- Links arrive by paste. Downloads go to user-chosen Videos/Music folders, or a separate folder per preset.
- Authentication comes from browser cookies (`--cookies-from-browser`, first-class support for Brave profiles, cookie snapshot) or an imported cookies.txt. Site accounts live in the OS keychain and reach yt-dlp through `--netrc-cmd`. Video passwords and 2FA codes are asked for each time and never stored.

## Capabilities and Constraints

- **Downloads:**
  - Video (quality and container) or audio extraction (mp3, m4a, opus, flac).
  - Playlists, including picking individual entries.
  - A concurrent queue with cancel and retry.
  - Searchable history with "open file" and "open folder".
  - Post-processing: embed thumbnail, metadata and subtitles; SponsorBlock.
  - Editable presets.
- **Dependencies:**
  - A dependencies screen shows installed, system-detected and missing tools, with one-click install, update and remove.
  - On Windows the binaries live in `%LOCALAPPDATA%\ymd\bin` by default, and the location can be changed.
- **Language and appearance:** Spanish and English UI (i18n), plus light and dark themes with a customizable accent color, density, corner radius and text size.
- **Constraints:**
  - Arguments are always passed to yt-dlp as an argv list, never through a shell.
  - Secrets never go to disk in plaintext or into process arguments.
  - GPL binaries are downloaded at runtime and not bundled in the installer.

## Brand Commitments

- The name is "ymd".
- It uses its own isotype and logotype. It must not use YouTube's logo or other third-party marks.

## Evidence on Hand

There are no testimonials, user counts or benchmarks. Don't invent any.

## Product Principles

1. **The terminal is never required.** Every dependency, update and error can be resolved from inside the app.
2. **Every failure tells you the next step.** A raw stderr dump is a bug.
3. **The user's secrets stay theirs.** Use cookies and the OS keychain, opt-in only, and make deletion one click away.
4. **Calm while busy.** Many parallel downloads should read as orderly progress, not noise.
5. **Nothing breaks silently.** Every change ships with tests, and CI gates merges.

## Accessibility & Inclusion

- WCAG AA contrast in both themes, including with user-chosen accent colors (the app clamps the accent when contrast is too low).
- Full keyboard operation with visible focus.
- Reduced-motion respected.
