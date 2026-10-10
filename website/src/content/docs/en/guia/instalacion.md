---
title: Installation
description: How to install ymd on Windows, macOS and Linux.
---

Download the latest version from the repository's [releases page](https://github.com/galexbh/ymd/releases/latest).

| Platform            | File                                    | Notes                                             |
| ------------------- | --------------------------------------- | ------------------------------------------------- |
| Windows 10/11 (x64) | `ymd_<version>_x64-setup.exe`           | Per-user install, no administrator rights needed. |
| macOS 11+           | `ymd_<version>_universal.dmg`           | Universal: Apple Silicon and Intel.               |
| Linux (x64)         | `ymd_<version>_amd64.AppImage` / `.deb` |                                                   |

The installer doesn't include yt-dlp or FFmpeg. ymd downloads them from their official sources the first time you open it (see [First run](/ymd/en/guia/primer-uso/)).

## Windows

1. Download `ymd_<version>_x64-setup.exe`.
2. Run it. The installer (NSIS) installs ymd for your user only and doesn't ask for administrator rights.
3. Open ymd from the Start menu.

### SmartScreen warning

The installer isn't code-signed (Authenticode) yet, so Windows SmartScreen may show "Windows protected your PC" the first time. Select **More info**, then **Run anyway**.

Later updates of ymd are signed for the built-in updater (see [Updates](/ymd/en/guia/actualizaciones/)); SmartScreen only steps in for the manual install.

## macOS

1. Download `ymd_<version>_universal.dmg`. It runs on Apple Silicon and Intel.
2. Open the `.dmg` and drag ymd to **Applications**.

There is no FFmpeg build ymd can download for macOS. The **Dependencies** screen shows the command to install it with Homebrew: `brew install ffmpeg`.

## Linux

- **AppImage:** download `ymd_<version>_amd64.AppImage`, make it executable (`chmod +x`) and open it.
- **Debian and Ubuntu:** install the `.deb` with `sudo apt install ./ymd_<version>_amd64.deb`.

## Uninstall

- **Windows:** from **Settings → Apps**. The uninstaller also removes the browser cookie-bridge registration.
- **macOS:** drag ymd from **Applications** to the Trash.
- **Linux:** delete the AppImage or uninstall the package.

Downloaded tools live in the [tools folder](/ymd/en/dependencias/#tools-folder), outside ymd's installation. You can delete them by hand if you no longer need them.
