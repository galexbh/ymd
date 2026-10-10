---
title: Why they're needed
description: When ymd needs your session, and the options available.
---

Some videos only download while you're signed in:

- YouTube sometimes asks you to confirm you're not a bot.
- Age-restricted videos, private videos your account can access, or members-only videos.
- Sites that require signing in, such as Vimeo or Udemy.

yt-dlp doesn't have your session on its own. ymd can give it one in several ways, all optional and set up in **Settings → Accounts**:

| Option                                              | What for                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [ymd Cookies extension](/ymd/en/cookies/extension/) | Brave, Chrome, Edge and other Chromium browsers. Sends the cookies to ymd whenever they change. |
| [Firefox cookies](/ymd/en/cookies/navegador/)       | ymd reads Firefox's cookies directly (and Safari's on macOS).                                   |
| [cookies.txt file](/ymd/en/cookies/cookies-txt/)    | A copy exported by hand. Works with any browser.                                                |
| [Site accounts](/ymd/en/cookies/cuentas/)           | Username and password for sites that accept them in yt-dlp, stored in the system keychain.      |

## Cookie source

In **Settings → Accounts → Browser cookies**, **Cookie source** has four values:

- **None**: downloads without being signed in.
- **Extension**: for Brave, Chrome, Edge and other Chromium browsers. The ymd extension sends your cookies whenever they change.
- **Firefox**: ymd reads Firefox's cookies on every download, even while it's open. On macOS it's called **Firefox or Safari**.
- **cookies.txt file**: ymd uses a cookies.txt file you export yourself. Works with any browser.

The extension and the imported file write to the same ymd cookie copy.

## Privacy

- Site passwords live only in the system keychain; never on disk or in process arguments.
- ymd's cookie copy is stored in its data folder, readable only by your user, and deleted with **Delete copy**.
- yt-dlp gets a temporary copy of the cookies on every run.
- A video password and a 2FA code for one download are used for that download and never stored.
