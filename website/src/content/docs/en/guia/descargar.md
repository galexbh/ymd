---
title: Download video and audio
description: The Receive counter, presets, playlists, the queue and the ledger.
---

ymd treats every download as an accession: it gets a number, moves through the ledger and, once done, is stamped **Archived** with its date.

## The counter

The **Receive** screen has an intake counter:

1. Paste a link into the **Link** field (YouTube or any site yt-dlp supports). With the counter empty, <kbd>Ctrl</kbd>+<kbd>V</kbd> pastes and checks the link from anywhere on the screen.
2. ymd checks the link and shows its card: title, duration, site and, for a playlist, the number of entries. The card also shows the preset and the shelf (the folder) it will be filed on.
3. Pick **Video** or **Audio** and a **Preset**.
4. Click **File it** (or press <kbd>Enter</kbd>).

For protected videos, **Options for this download** takes a **Video password** and a **Verification code (2FA)**. They aren't saved: they're used for that download and then forgotten.

## Presets

A preset sets the format, the quality and what gets embedded. ymd ships five:

| Preset         | Type  | Result                                                     |
| -------------- | ----- | ---------------------------------------------------------- |
| Best quality   | Video | The best quality available                                 |
| MP4 1080p      | Video | MP4 up to 1080p                                            |
| MP4 720p       | Video | MP4 up to 720p                                             |
| MP3 320 kbps   | Audio | Extracted to MP3                                           |
| Original audio | Audio | The audio as the site serves it (m4a or opus), unconverted |

In **Settings → Presets** you can create your own (**New preset**) or duplicate a built-in one. Each preset defines:

- **Maximum height** and **Container** (MP4, MKV, WebM or whatever comes, no re-encoding) for video.
- **Audio format** (MP3, M4A, Opus, FLAC or original) and **Quality** for audio.
- **Embed thumbnail**, **Embed metadata** and **Embed subtitles**, with **Subtitle languages** (for example `es,en`).
- **Remove segments with SponsorBlock**, choosing the categories (sponsor, intro, endcards, self-promotion…).
- **Preset folder**: empty uses the general video or music folder.

On a built-in preset only the embedding options and the folder change; the format stays current with ymd. **Use as the default preset** keeps it selected at the counter.

## Playlists

When the link is a playlist, the card shows a thumbnail grid with every entry:

- **All** or **None** select or clear the whole list.
- **From** … **to** and **Select range** pick a stretch.
- <kbd>Shift</kbd> + click marks every entry between two clicks.

Each selected entry goes into the ledger as its own download ("Entry 3 of 12").

## The queue

Several downloads run at once. Change the number in **Settings → Downloads → Downloads at once** (between 1 and 8); more at once share the same connection. In the same section:

- **Folders**: video folder, music folder and **Ask for the folder on every download**.
- **File name**: the **Template** uses yt-dlp fields such as `%(title)s`, `%(id)s`, `%(uploader)s` or `%(ext)s`. It must include `%(ext)s`.
- **Skip what's already downloaded**: yt-dlp notes every video in an archive file and never repeats it.
- **Use aria2c**: downloads each file over several connections (install aria2c in Dependencies first).

## The ledger

The **Ledger** screen lists every download in the session, newest first, with its number (**No.**), title, format, size, exact progress in bytes, speed, time left and status. You can filter by status (**Running**, **Queued**, **Archived**, **Failed**) and **Clear finished**. The **Receive** screen shows this session's ledger under the counter.

Each row has its actions: **Cancel**, **Retry**, **Open file**, **Show in folder** and **Remove from ledger**.

## Stamps

Each accession's status shows as a stamp:

| Stamp       | Meaning                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| Queued      | Waiting for its turn.                                                                                     |
| Downloading | yt-dlp is fetching the file.                                                                              |
| Merging     | ffmpeg joins the video and audio tracks.                                                                  |
| Processing  | Post-processing: thumbnail, metadata, subtitles, SponsorBlock or conversion.                              |
| Archived    | Done. The file is noted in the [Catalog](/ymd/en/guia/catalogo/).                                         |
| Failed      | Something went wrong. The message says what to do; see [Troubleshooting](/ymd/en/solucion-de-problemas/). |
| Canceled    | You canceled it.                                                                                          |

A failed download shows the reason and a button with the direct fix. **Show the error detail** expands yt-dlp's last line, useful for reporting a problem.

## Keyboard shortcuts

<kbd>Ctrl</kbd> on Windows and Linux; <kbd>Cmd</kbd> on macOS.

| Shortcut                                  | Action                                             |
| ----------------------------------------- | -------------------------------------------------- |
| <kbd>Ctrl</kbd>+<kbd>L</kbd>              | Go to the link field                               |
| <kbd>Ctrl</kbd>+<kbd>V</kbd>              | Paste a link and check it (with the counter empty) |
| <kbd>Enter</kbd>                          | File the checked link                              |
| <kbd>Ctrl</kbd>+<kbd>1</kbd>–<kbd>5</kbd> | Switch section                                     |
| <kbd>Ctrl</kbd>+<kbd>,</kbd>              | Open Settings                                      |
| <kbd>?</kbd>                              | Show the shortcut list                             |
