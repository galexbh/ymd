---
title: Browser cookies
description: Letting yt-dlp read cookies straight from the browser, and why Firefox is the pick on Windows.
---

With **Cookie source → Browser**, yt-dlp reads the browser's cookies on every download (`--cookies-from-browser`).

## Pick a browser and profile

In **Settings → Accounts → Browser cookies**:

1. Pick the **Browser**. ymd detects the installed ones (**Detect again** repeats the search) and marks the ones that are open.
2. Pick the **Profile** if the browser has several. Brave is first-class: its profiles are read from its own configuration.
3. Click **Test cookies**. If they work, they're used for the next downloads.

**Import from the browser now** saves a copy into ymd's `cookies.txt`. Then choose **cookies.txt file** as the source to use it with the browser open.

## Windows: Firefox recommended

On Windows, Firefox is the only browser whose cookies yt-dlp can read directly. Brave, Chrome and Edge protect them with app-bound encryption: only the browser itself can decrypt them, so no other program, yt-dlp included, can open them. They also keep the cookie database locked while they're open.

That's why the list marks Firefox as **recommended on Windows**. Sign in to YouTube in Firefox and pick it as the browser. If you don't have it, **Get Firefox** opens its download page.

If you use Brave, Chrome or Edge on Windows, there are two alternatives:

- The [ymd Cookies extension](/ymd/en/cookies/extension/), which sends the cookies from inside the browser.
- A [cookies.txt file](/ymd/en/cookies/cookies-txt/) exported by hand.

On macOS and Linux, yt-dlp can read cookies from Chromium browsers and Firefox (and Safari on macOS).

## Common errors

- **The browser is locking its cookies**: close it completely, including the icon next to the clock, and click **I closed Brave, test again** (with your browser's name). Or use a `cookies.txt`, which works with the browser open.
- **Couldn't read the browser's cookies**: that's the Windows encryption described above. Use the ymd extension, Firefox or a `cookies.txt`.

More in [Troubleshooting](/ymd/en/solucion-de-problemas/).
