---
title: Troubleshooting
description: What each error ymd shows means and how to fix it.
---

When a download fails, ymd turns the yt-dlp error into a message with its fix and a button that takes you there. Each entry on this page uses the title the app shows, followed by the error's internal code (useful when reporting a problem). **Show the error detail** expands yt-dlp's last line.

## Session and access

### YouTube wants to confirm you're not a bot

`bot_check`. YouTube blocked the request until you prove you're a person, which needs a signed-in session.

**Fix:** turn on your browser cookies in **Settings → Accounts**, then try again. The **Open Settings → Accounts** button takes you there. On Windows with Brave, Chrome or Edge, use the [ymd Cookies extension](/ymd/en/cookies/extension/); otherwise [Firefox](/ymd/en/cookies/navegador/) or a [cookies.txt](/ymd/en/cookies/cookies-txt/).

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

**Fix:** try from a connection in an allowed region.

## Browser cookies

### The browser is locking its cookies

`cookies_locked`. The browser is open and keeps its cookie database locked, so yt-dlp can't read it.

**Fix:** quit the browser completely, including the icon next to the clock, and click **I closed the browser, retry** (shown with its name). Or click **Use a cookies.txt file**: a cookie copy works with the browser open.

### Couldn't read the browser's cookies

`cookies_decrypt`. yt-dlp found the cookies but couldn't decrypt them. On Windows, Brave, Chrome and Edge encrypt them so no other program can read them (see [Browser cookies](/ymd/en/cookies/navegador/#windows-firefox-recommended)).

**Fix:** quit the browser and retry. If it keeps failing, import a `cookies.txt` file in **Settings → Accounts**, use the [ymd Cookies extension](/ymd/en/cookies/extension/) or switch to Firefox.

## Tools

### ffmpeg is missing

`ffmpeg_missing`. yt-dlp needs ffmpeg to join video and audio or to convert the format.

**Fix:** install it with one click in **Dependencies** (the **Install ffmpeg** button). On macOS, install it with `brew install ffmpeg`.

### The JavaScript runtime (Deno) is missing

`js_runtime_missing`. YouTube requires running JavaScript to list formats, and there's no supported runtime.

**Fix:** install Deno in **Dependencies** (the **Install Deno** button). See [JavaScript runtime](/ymd/en/dependencias/#javascript-runtime).

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

**Fix:** retry. If it fails again, update yt-dlp in **Dependencies** and copy the technical detail if you need to report it. Sites change often; the [Nightly](/ymd/en/guia/actualizaciones/#update-channel) channel usually gets the fix first.

### Windows protected your PC (SmartScreen)

When installing ymd on Windows, SmartScreen may show this warning because the installer isn't code-signed (Authenticode) yet.

**Fix:** select **More info**, then **Run anyway**. See [Installation](/ymd/en/guia/instalacion/#smartscreen-warning).
