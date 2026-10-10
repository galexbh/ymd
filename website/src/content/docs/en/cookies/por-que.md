---
title: Why they're needed
description: When ymd needs your session, and the options available.
---

Some videos only download while you're signed in:

- YouTube sometimes asks you to confirm you're not a bot.
- Age-restricted videos, private videos your account can access, or members-only videos.
- Sites that require signing in, such as Vimeo or Udemy.

yt-dlp doesn't have your session on its own. ymd can give it one in several ways, all optional and set up in **Settings → Accounts**:

| Option                                              | What for                                                                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [ymd Cookies extension](/ymd/en/cookies/extension/) | Brave, Chrome and Edge. Sends the cookies to ymd whenever they change. Recommended on Windows for Chromium browsers. |
| [Browser cookies](/ymd/en/cookies/navegador/)       | yt-dlp reads the cookies directly. Firefox on Windows; any supported browser on macOS and Linux.                     |
| [cookies.txt file](/ymd/en/cookies/cookies-txt/)    | A copy exported by hand. Works with any browser.                                                                     |
| [Site accounts](/ymd/en/cookies/cuentas/)           | Username and password for sites that accept them in yt-dlp, stored in the system keychain.                           |

## Cookie source

In **Settings → Accounts → Browser cookies**, **Cookie source** has three values:

- **None**: downloads without being signed in.
- **Browser**: ymd reads the browser's cookies on every download.
- **cookies.txt file**: ymd uses the imported copy; it works even with the browser open. The extension writes to this same copy.

## Privacy

- Site passwords live only in the system keychain; never on disk or in process arguments.
- ymd's cookie copy is stored in its data folder, readable only by your user, and deleted with **Delete copy**.
- yt-dlp gets a temporary copy of the cookies on every run.
- A video password and a 2FA code for one download are used for that download and never stored.
