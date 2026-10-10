---
title: cookies.txt file
description: Importing a cookie copy in Netscape format.
---

A `cookies.txt` file works with any browser, even while it's open. It's the alternative to the [extension](/ymd/en/cookies/extension/) if you'd rather not install it.

## Export

1. In your browser, install an open-source cookie export extension, such as "Get cookies.txt LOCALLY".
2. Open a private window and allow the extension there.
3. Sign in to YouTube (or the site you need) in that window.
4. Use the extension to export the cookies in Netscape format (`cookies.txt`), then close the private window.

The private window keeps the exported session separate from your everyday browser session.

## Import

In **Settings → Accounts**, drag the file onto **Drop your cookies.txt here** or click **Choose file…**. Once imported, the cookie source switches to **cookies.txt file**.

If it fails with **The file couldn't be imported**, check that it's a `cookies.txt` in Netscape format.

## ymd's copy

The **ymd's cookie copy** section shows its origin (imported file, browser or extension), the date, the number of cookies and the domains.

The copy holds your signed-in sessions. It's stored only in ymd's data folder, readable only by your user, and deleted with **Delete copy**. yt-dlp gets a temporary copy on every run.
