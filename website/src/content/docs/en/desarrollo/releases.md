---
title: Releases
description: How a ymd version is published and how updates are signed.
---

## Publishing a version

1. **Changelog:** add the version's section to [`CHANGELOG.md`](/ymd/en/changelog/). The release body is generated from that section (`scripts/release-notes.mjs`).
2. **Version:** bump it in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
3. **Tag:** create the `vX.Y.Z` tag and push it.
4. **Draft:** `release.yml` builds on Windows (NSIS), macOS (universal `.dmg`) and Linux (`.AppImage` and `.deb`) and creates a draft release with the installers, their `.sig` files, `latest.json` and the extension zip.
5. **Publish:** review the draft and publish it. Installed copies only see published releases.

## Signed updates

ymd updates with `tauri-plugin-updater`: it reads `releases/latest/download/latest.json` from GitHub, and every installer is signed (minisign). The public key lives in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).

The private key is not part of the repository. In CI it's provided through the `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets.

To build an installer locally (`pnpm tauri build`), export those two environment variables first; without them the updater signing step fails. `pnpm tauri build --no-bundle` builds without packaging and doesn't need them.

## Code signing

Windows installers aren't code-signed (Authenticode), so SmartScreen shows a warning on the first install. Updater signing is separate: it protects automatic updates.
