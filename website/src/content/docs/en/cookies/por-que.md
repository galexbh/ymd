---
title: Why cookies are needed
description: When ymd needs your session, and the options available.
---

Some videos only download while you're signed in:

- YouTube sometimes asks you to confirm you're not a bot.
- Age-restricted videos, private videos your account can access, or members-only videos.
- Sites that require signing in, such as Vimeo or Udemy.

yt-dlp has no access to your session by default. ymd can give it one in several ways, all optional and set up in **Settings → Accounts**:

| Option                                              | What for                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [ymd Cookies extension](/ymd/en/cookies/extension/) | Brave, Chrome, Edge and other Chromium browsers. Sends the cookies to ymd whenever they change. |
| [Firefox cookies](/ymd/en/cookies/navegador/)       | ymd reads Firefox's cookies directly (and Safari's on macOS).                                   |
| [Site accounts](/ymd/en/cookies/cuentas/)           | Username and password for sites that accept them in yt-dlp, stored in the system keychain.      |

## Cookie source

In **Settings → Accounts → Browser cookies**, **Cookie source** has three values:

- **No session**: ymd downloads as if you weren't signed in. Use it for public videos or when you'd rather not use your account: with many downloads, YouTube may flag or limit an account used with yt-dlp.
- **Extension**: for Brave, Chrome, Edge and other Chromium browsers. The ymd extension sends your cookies whenever they change.
- **Firefox**: ymd reads Firefox's cookies on every download, even while it's open. On macOS it's called **Firefox or Safari**.

ymd doesn't import manually exported `cookies.txt` files: such a file holds all your sessions in plain text, outside the browser's protection. The extension hands the cookies over directly, and ymd stores them encrypted.

## Privacy

- Site passwords are stored only in the system keychain; never on disk or in process arguments.
- ymd's cookie copy is stored in its data folder, readable only by your user, and deleted with **Delete copy**.
- yt-dlp gets a temporary copy of the cookies on every run.
- A video password and a 2FA code for one download are used for that download and never stored.
