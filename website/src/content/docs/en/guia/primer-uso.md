---
title: First run
description: The welcome screen installs the tools and picks where downloads are filed.
---

The first time you open ymd, the **Before the first accession** screen appears. It has three parts.

## Tools

ymd downloads with [yt-dlp](https://github.com/yt-dlp/yt-dlp) and merges video and audio with [FFmpeg](https://ffmpeg.org/). Click **Install what's needed** and ymd downloads them, verified, into your user folder. If your computer has no JavaScript runtime, it also installs [Deno](https://deno.com/), which YouTube requires to list formats.

If the installation doesn't finish, it's usually the connection or a temporary GitHub limit. What's already installed is kept; retry in a moment. You can review, update or remove the tools any time in [Dependencies](/ymd/en/dependencias/).

## Where things are filed

Videos and music go to separate folders (**Videos** and **Music**). Click **Change** to pick others. Each preset can also have its own folder (see [Download video and audio](/ymd/en/guia/descargar/#presets)).

## Accounts (optional)

If YouTube asks you to confirm you're not a bot, ymd can use your browser's cookies. **Set up cookies** opens **Settings → Accounts**. You can do it later; see [Cookies and accounts](/ymd/en/cookies/por-que/).

## Finish

Click **Start receiving** to go to the counter on the **Receive** screen, or **Skip for now**. Without yt-dlp and ffmpeg nothing can be downloaded; you can install them later in **Dependencies**.
