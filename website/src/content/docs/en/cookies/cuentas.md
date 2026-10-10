---
title: Site accounts
description: Username and password for sites that accept them in yt-dlp, stored in the system keychain.
---

Some sites, such as Vimeo, accept a username and password in yt-dlp. ymd keeps them in **Settings → Accounts → Site accounts**.

## Add an account

1. In **Site**, search the site by name (for example "Vimeo, Udemy, Twitch…"). Only sites that take an account in yt-dlp are listed.
2. Enter **Username** and **Password**.
3. Click **Save account**.

If the site isn't listed, **Other (advanced)** lets you type the **Site key** yourself: yt-dlp's netrc key, for example `vimeo`. Only lowercase letters, digits, dot, hyphen and underscore are allowed, not starting with a hyphen or underscore.

YouTube doesn't accept a username and password. For YouTube, use [cookies](/ymd/en/cookies/por-que/).

## How they're stored

- The password goes to the system keychain: Credential Manager on Windows, Keychain on macOS and Secret Service on Linux. ymd never shows it again.
- ymd only keeps an index of site and username on disk, with no passwords, to list the accounts.
- When downloading, yt-dlp asks for the account with `--netrc-cmd`: it runs ymd as a helper, which reads the keychain and prints a single netrc line on standard output. The password never touches the disk or any process's arguments.

## Supported sites

**Supported sites** shows the official extractor list of yt-dlp, ymd's download engine (about 1,700), bundled with ymd and updated with each release. You can search by name or description and filter by **Takes an account** or **Broken** (per yt-dlp).

**How do I add more?** sums up the options:

- **The site asks for an account**: pick it in **Site accounts** and save your username and password.
- **The site has no account or needs a browser login**: use cookies.
- **The site isn't on the list**: paste the link anyway; yt-dlp's generic extractor works with many pages. If it fails, you can ask for support in [yt-dlp's issues](https://github.com/yt-dlp/yt-dlp/issues).
