---
title: Troubleshooting
description: What each error ymd shows means and how to fix it.
---

When a download fails, ymd turns the yt-dlp error into a message with its fix and a button that takes you there. Each entry on this page uses the title the app shows, followed by the error's internal code (useful when reporting a problem). **Show the error detail** expands yt-dlp's last line.

## Session and access

### YouTube wants to confirm you're not a bot

`bot_check`. YouTube blocked the request until you prove you're a person, which needs a signed-in session.

**Fix:** turn on your browser cookies in **Settings → Accounts**, then try again. The **Open Settings → Accounts** button takes you there. With Brave, Chrome, Edge or another Chromium browser, use the [ymd Cookies extension](/ymd/en/cookies/extension/) on any system; with Firefox (or Safari on macOS), ymd [reads the cookies directly](/ymd/en/cookies/navegador/).

### Age-restricted video

`age_restricted`. The video is only shown to accounts that confirmed they're adults.

**Fix:** sign in to an adult account in your browser and turn on its cookies in **Settings → Accounts**.

### This content requires signing in

`login_required`. The site requires a session for this content.

**Fix:** turn on your browser cookies or add your site account in **Settings → Accounts** (see [Site accounts](/ymd/en/cookies/cuentas/)).

### The video is private

`private`. The uploader marked it private.

**Fix:** if your account has access, turn on your browser cookies in **Settings → Accounts** and retry.

### The video is no longer available

`unavailable`. The site says the video doesn't exist or can't be watched.

**Fix:** it may have been removed or blocked. Open the link in your browser to confirm.

### Not available in your country

`geoblocked`. The uploader restricted the video by region.

**Fix:** download from a connection located in an allowed region.

## Browser cookies

### The browser is locking its cookies

`cookies_locked`. The browser is open and keeps its cookie database locked, so yt-dlp can't read it.

**Fix:** it happens with Chromium browsers, which ymd doesn't read directly. Choose **Extension** as the source in **Settings → Accounts** and use the [ymd Cookies extension](/ymd/en/cookies/extension/), which works with the browser open.

### Couldn't read the browser's cookies

`cookies_decrypt`. yt-dlp found the cookies but couldn't decrypt them. On Windows, Brave, Chrome and Edge encrypt them so no other program can read them (see [Chromium browsers](/ymd/en/cookies/navegador/#chromium-browsers)).

**Fix:** choose **Extension** as the source in **Settings → Accounts** and use the [ymd Cookies extension](/ymd/en/cookies/extension/). As an alternative, use [Firefox cookies](/ymd/en/cookies/navegador/).

## Tools

### ffmpeg is missing

`ffmpeg_missing`. yt-dlp needs ffmpeg to join video and audio or to convert the format.

**Fix:** install it with one click in **Dependencies** (the **Install ffmpeg** button). On macOS, install it with `brew install ffmpeg`.

### The JavaScript runtime (Node.js) is missing

`js_runtime_missing`. YouTube requires running JavaScript to list formats, and there's no supported runtime.

**Fix:** install Node.js in **Dependencies** (the **Install Node.js** button). See [JavaScript runtime](/ymd/en/dependencias/#javascript-runtime).

### A required tool is missing

`binary_missing`. yt-dlp or another required tool can't be found.

**Fix:** open **Dependencies** and install whatever is marked as missing (the **Install what's missing** button).

## Link and network

### This link isn't supported

`unsupported_url`. yt-dlp doesn't recognize the address.

**Fix:** check that it points to a video or a playlist. If the site is new, update yt-dlp in **Dependencies** (the **Check yt-dlp in Dependencies** button). See also [Supported sites](/ymd/en/cookies/cuentas/#supported-sites).

### The connection dropped

`network`. The connection dropped or the server didn't answer.

**Fix:** check your internet connection and try again.

## Disk and folders

### The disk is full

`disk_full`. The destination folder's disk is full.

**Fix:** free up space or choose another destination folder in **Settings → Downloads** (the **Change folder in Settings** button).

### No permission to write to the folder

`permission_denied`. Your user can't write to the destination folder.

**Fix:** choose another destination folder in **Settings → Downloads**.

## Other

### The download failed for an unexpected reason

`unknown`. yt-dlp failed with an error ymd doesn't recognize.

**Fix:** try again. If it fails again, update yt-dlp in **Dependencies** and copy the technical detail if you need to report it. Sites change often; the [Nightly](/ymd/en/guia/actualizaciones/#update-channel) channel usually gets the fix first.

### Windows protected your PC (SmartScreen)

When installing ymd on Windows, SmartScreen may show this warning because the installer isn't code-signed (Authenticode).

**Fix:** select **More info**, then **Run anyway**. See [Installation](/ymd/en/guia/instalacion/#smartscreen-warning).

## Reporting a problem

### ymd's logs

ymd notes what it does (how long each stage of a download takes, how it ended, the error code, tool updates and how many cookies came in from the extension) in text files inside its data folder, under `logs`:

- **Windows:** `%APPDATA%\com.ymd.app\logs`
- **macOS:** `~/Library/Application Support/com.ymd.app/logs`
- **Linux:** `~/.local/share/com.ymd.app/logs`

**Settings → Advanced → Open data folder** opens that folder. There's one file per day (`ymd.YYYY-MM-DD.jsonl`), and ymd automatically deletes the ones older than 14 days (and the oldest ones if together they exceed 20 MB).

The logs never leave your computer: ymd has no analytics or telemetry and sends them nowhere. They don't store links, passwords, 2FA codes or cookies either; before writing each line, ymd strips your home-folder paths, link parameters and anything that looks like a token.

### Export diagnostics

To report a problem in [ymd's issues](https://github.com/galexbh/ymd/issues):

1. Open **Settings → Advanced** and click **Export diagnostics**.
2. Choose where to save the `ymd-diagnostico-YYYYMMDD-HHMM.zip` file. When it's done, the **Diagnostics saved** notice has **Show in folder**.
3. Attach that zip to the issue and describe what you did and what you expected.

The zip is created on your computer and is only shared if you attach it. It contains:

- `info.txt`: ymd's version, operating system and architecture, language, the yt-dlp, FFmpeg and Node.js versions, the JavaScript runtime in use and a summary of your settings (only options and numbers, like the yt-dlp channel or how many simultaneous downloads; no folders).
- `logs/`: the logs from the last 14 days, cleaned again on export.
- `timings.txt`: how long each stage (download, merge, post-processing) of the latest downloads took.

It doesn't contain your history, the download archive, cookies, passwords, system keychain data or your settings file.
