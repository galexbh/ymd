---
title: Firefox cookies
description: Letting ymd read Firefox's cookies (or Safari's on macOS) directly, and why Chromium browsers go through the extension.
---

With **Cookie source → Firefox**, ymd reads Firefox's cookies on every download (`--cookies-from-browser`). On macOS the option is called **Firefox or Safari** and lets you pick either one.

## Pick a profile

In **Settings → Accounts → Browser cookies**:

1. Choose **Firefox** as the source. ymd detects it (**Detect again** repeats the search). If you don't have it, **Get Firefox** opens its page.
2. Pick the **Profile** if you have several.
3. Click **Test cookies**. If they work, they're used for the next downloads.

Firefox can stay open while you download: ymd reads a copy of its cookies.

**Import from the browser now** saves a copy into ymd's `cookies.txt`. Then choose **cookies.txt file** as the source to use that copy instead of reading Firefox on every download.

## What about Brave, Chrome or Edge?

Chromium browsers aren't read directly; they use the [ymd Cookies extension](/ymd/en/cookies/extension/) (source **Extension**). Two reasons:

- On Windows they encrypt their cookies with app-bound encryption: only the browser itself can decrypt them, so no other program can open them.
- They keep the cookie database locked while they run, and many keep running in the background after the last window closes (Edge's “Startup boost”, for example).

The extension avoids both: it reads the cookies from inside the browser and works with the browser open, on Windows, macOS and Linux.

More in [Troubleshooting](/ymd/en/solucion-de-problemas/).
