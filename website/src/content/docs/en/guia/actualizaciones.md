---
title: Updates
description: How ymd and yt-dlp are kept up to date.
---

## ymd

ymd updates from [GitHub Releases](https://github.com/galexbh/ymd/releases). Every version is signed and verified before it installs.

- When ymd opens and a new version is out, the notice **A new version of ymd is available** offers **Install and restart** or **Later**.
- **Settings → Advanced → ymd** shows the **Installed version** and a **Check for updates** button.

Installed copies only see published versions. If the check fails, try again later or download the latest version from the [releases page](https://github.com/galexbh/ymd/releases/latest).

## yt-dlp

Sites change often and yt-dlp fixes them just as fast, so it pays to keep it current. In **Settings → Advanced → yt-dlp**:

### Update channel

| Channel | Description                                                            |
| ------- | ---------------------------------------------------------------------- |
| Stable  | Tested releases. They can take weeks to catch up with site changes.    |
| Nightly | Recommended: a daily build with the latest fixes.                      |
| Master  | Every change as soon as it lands. Only if you're after a specific fix. |

### Automatic updates

**Update yt-dlp automatically** checks when ymd opens and updates when nothing is downloading. yt-dlp can't be changed while downloads are running or queued.

You can also update by hand from [Dependencies](/ymd/en/dependencias/) with **Check for updates**. If the system's yt-dlp is out of date, ymd offers to install its own copy, which takes precedence; the system file is left untouched.
