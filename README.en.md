<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/ymd-isotype-dark.svg">
  <img src="docs/assets/ymd-isotype-light.svg" alt="ymd" width="96">
</picture>

<p><strong>A desktop app to download video and audio with yt-dlp.</strong></p>

[![CI](https://github.com/galexbh/ymd/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/galexbh/ymd/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/galexbh/ymd?display_name=tag&sort=semver)](https://github.com/galexbh/ymd/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Tauri 2](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)
[![Documentation](https://img.shields.io/badge/docs-galexbh.github.io%2Fymd-5b3fc4)](https://galexbh.github.io/ymd/en/)

[Download](https://github.com/galexbh/ymd/releases/latest) ·
[**Documentation**](https://galexbh.github.io/ymd/en/) ·
[Changelog](CHANGELOG.md) ·
[Contributing](CONTRIBUTING.md) ·
[Español](README.md)

</div>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshot-receive-dark.png">
  <img src="docs/assets/screenshot-receive-light.png" alt="ymd's Receive screen with a video card and the download ledger">
</picture>

## Features

- **Video and audio:** MP4, MKV or WebM with a configurable maximum quality; extraction to MP3, M4A, Opus or FLAC.
- **Playlists:** whole or selected entries.
- **Download queue:** parallel downloads with progress, speed and time remaining; cancel and retry.
- **Catalog:** searchable history with quick access to each file and its folder.
- **Post-processing:** embedded thumbnail, metadata and subtitles; SponsorBlock.
- **Editable presets**, each with its own destination folder.
- **Managed dependencies:** installs and updates yt-dlp, ffmpeg and Deno in a per-user folder, verified with SHA-256.
- **Cookies and accounts:** a companion extension for Brave, Chrome and Edge; Firefox cookies; `cookies.txt` import; credentials kept in the OS keychain.
- **Copied-link detection** from the clipboard, configurable.
- **Error diagnosis** for yt-dlp failures, with the action that fixes them.
- **Themes:** light and dark, with configurable accent color, density and text size.
- **Signed automatic updates.**
- **Spanish and English** interface.

<table>
  <tr>
    <td width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshot-catalog-dark.png">
        <img src="docs/assets/screenshot-catalog-light.png" alt="Download catalog">
      </picture>
    </td>
    <td width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshot-appearance-dark.png">
        <img src="docs/assets/screenshot-appearance-light.png" alt="Appearance settings">
      </picture>
    </td>
  </tr>
  <tr>
    <td align="center">Catalog</td>
    <td align="center">Appearance</td>
  </tr>
</table>

## Installation

Download the latest version from [Releases](https://github.com/galexbh/ymd/releases/latest).

| Platform            | File                                    | Notes                                      |
| ------------------- | --------------------------------------- | ------------------------------------------ |
| Windows 10/11 (x64) | `ymd_<version>_x64-setup.exe`           | Per-user install, no administrator rights. |
| macOS 11+           | `ymd_<version>_universal.dmg`           | Universal: Apple Silicon and Intel.        |
| Linux (x64)         | `ymd_<version>_amd64.AppImage` / `.deb` |                                            |

> [!NOTE]
> The Windows installer is not Authenticode-signed yet, so SmartScreen may show a warning the first time. Choose **More info → Run anyway**.

On first launch, the welcome screen installs what ymd needs. From then on ymd keeps its dependencies and itself up to date. Per-OS details in the [installation guide](https://galexbh.github.io/ymd/en/guia/instalacion/).

## Dependencies

ymd installs yt-dlp, FFmpeg and Deno in a per-user folder, verified with SHA-256, and keeps them up to date. Full table, locations and JavaScript runtimes in [Dependencies](https://galexbh.github.io/ymd/en/dependencias/).

## Cookies and accounts

For videos that need a session: the ymd Cookies extension for Brave, Chrome and Edge, Firefox cookies, `cookies.txt` or accounts in the system keychain. Options and privacy in [Cookies and accounts](https://galexbh.github.io/ymd/en/cookies/por-que/).

## Development

Requirements: Node 22+, stable Rust and, on Linux, the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/). `corepack enable && pnpm install && pnpm tauri dev` runs the app; `pnpm dev:mock` runs the UI only, against a simulated backend.

Guide, architecture, tests and releases in [Development](https://galexbh.github.io/ymd/en/desarrollo/contribuir/) and in [CONTRIBUTING.md](CONTRIBUTING.md).

| Path         | Contents                                                                  |
| ------------ | ------------------------------------------------------------------------- |
| `src/`       | User interface (React 19, TypeScript)                                     |
| `src-tauri/` | Backend (Rust, Tauri 2): queue, dependencies, authentication, history     |
| `extension/` | ymd Cookies extension (Manifest V3)                                       |
| `website/`   | [Documentation site](https://galexbh.github.io/ymd/en/) (Astro Starlight) |
| `e2e/`       | End-to-end tests                                                          |

## License

ymd is released under the [MIT License](LICENSE).

The **ymd** name and logo identify the official project and are not covered by the license; derived projects must use their own name and logo.

The installer does not include yt-dlp or FFmpeg. ymd downloads them from their official sources when needed, and each keeps its own license: see the [yt-dlp](https://github.com/yt-dlp/yt-dlp#license) and [FFmpeg](https://ffmpeg.org/legal.html) licenses.

## Disclaimer

ymd is not affiliated with YouTube or any other site. Respect each site's terms of service and only download content you have the right to keep.

## Acknowledgements

[yt-dlp](https://github.com/yt-dlp/yt-dlp), [FFmpeg](https://ffmpeg.org/), [Deno](https://deno.com/), [Tauri](https://tauri.app/), [React](https://react.dev/) and [Lucide](https://lucide.dev/).
