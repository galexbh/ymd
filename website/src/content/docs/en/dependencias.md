---
title: Dependencies
description: The tools ymd installs, where they live and how they're verified.
---

ymd installs the tools it needs in your user folder, checks their signature when the author publishes one, and keeps them up to date. It installs nothing system-wide. The **Dependencies** screen lists each tool with its level, status (**Installed**, **System**, **Missing**), version and verification.

## Tools

| Tool                                                  | Level       | Purpose                                                  | Source                                                                                                                                                      |
| ----------------------------------------------------- | ----------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp)            | required    | The download engine.                                     | Official executable from the chosen channel (stable, nightly or master), verified with `SHA2-256SUMS`.                                                      |
| [FFmpeg](https://ffmpeg.org/) (ffmpeg and ffprobe)    | required    | Merges video and audio and converts formats.             | [yt-dlp/FFmpeg-Builds](https://github.com/yt-dlp/FFmpeg-Builds) on Windows and Linux, verified with `checksums.sha256`. On macOS: `brew install ffmpeg`.    |
| [Deno](https://deno.com/)                             | recommended | JavaScript runtime YouTube requires to hand out formats. | [denoland/deno](https://github.com/denoland/deno), verified with its `.sha256sum` file.                                                                     |
| [aria2c](https://aria2.github.io/)                    | optional    | Downloads over several connections at once.              | Windows: [aria2/aria2](https://github.com/aria2/aria2) (no published checksum). macOS: `brew install aria2`. Linux: `sudo apt install aria2`.               |
| [AtomicParsley](https://github.com/wez/atomicparsley) | optional    | Embeds cover art in MP4 and M4A files.                   | [wez/atomicparsley](https://github.com/wez/atomicparsley) (no published checksum) on Windows, Apple Silicon macOS and x64 Linux; otherwise Homebrew or apt. |

When there's no downloadable build for your system, the screen shows the package manager command instead.

Actions: **Install everything recommended**, **Check for updates**, and per tool **Install**, **Update** or **Remove**. If an install fails, the previous copy, if any, is untouched.

## Tools folder

| System  | Default location                                         |
| ------- | -------------------------------------------------------- |
| Windows | `%LOCALAPPDATA%\ymd\bin`                                 |
| macOS   | `~/Library/Application Support/<app id>/bin`             |
| Linux   | `$XDG_DATA_HOME/<app id>/bin` (usually `~/.local/share`) |

The programs live here, outside ymd's install; removing them doesn't touch your downloads. Change the location in **Settings → Advanced → Tools folder** (**Back to the default** restores it). **Open data folder** opens the folder where ymd keeps its history and its cookie copy.

## Verification

Every download is checked against the SHA-256 checksum the author publishes before it replaces the installed copy. The **Verification** column reads **SHA-256 verified** or **not verified** (aria2c and AtomicParsley publish no checksums). The swap is atomic: a half-finished update never leaves a broken tool.

## System copies

If a tool is already installed on the system (on `PATH`), it shows as **System** and is used. If the system's yt-dlp is out of date, ymd can **Install an up-to-date copy**: its own takes precedence and the system file is left untouched.

## JavaScript runtime

YouTube requires running JavaScript to hand out formats. yt-dlp uses the first runtime it finds, in this order:

1. Deno installed by ymd.
2. Deno, Node, Bun or QuickJS from the system.

ymd only hands yt-dlp versions it supports: Deno 2.3.0 or later, Node 22 or later, Bun 1.2.11 to 1.3.14, QuickJS 2023-12-09 or later (QuickJS-NG, any). The **JavaScript runtime** section of Dependencies shows which one yt-dlp will use and which others it found. If there's none, install Deno in one click.
