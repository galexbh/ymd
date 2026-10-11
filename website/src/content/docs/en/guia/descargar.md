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

For protected videos, **Options for this download** takes a **Video password** and a **Verification code (2FA)**. They aren't saved: they're only used for that download.

## Presets

A preset sets the format, the quality and what gets embedded. ymd ships six:

| Preset         | Type  | Result                                                       |
| -------------- | ----- | ------------------------------------------------------------ |
| Best quality   | Video | The best quality available                                   |
| MP4 1080p      | Video | MP4 up to 1080p                                              |
| MP4 720p       | Video | MP4 up to 720p                                               |
| MP3 320 kbps   | Audio | Extracted to MP3                                             |
| M4A (AAC)      | Audio | AAC in an m4a container; from YouTube usually not re-encoded |
| Original audio | Audio | The audio as the site serves it (m4a or opus), unconverted   |

In **Settings → Presets** you can create your own (**New preset**) or duplicate a built-in one. Each preset defines:

- **Maximum height** and **Container** (MP4, MKV, WebM or whatever comes, no re-encoding) for video.
- **Audio format** (MP3, M4A, Opus, FLAC or original) and **Quality** for audio.
- **Embed thumbnail**, **Embed metadata** and **Embed subtitles**, with **Subtitle languages** (for example `es,en`).
- **Remove segments with SponsorBlock**, choosing the categories (sponsor, intro, endcards, self-promotion…).
- **Audio tidy-up**, on audio presets only (see below).
- **Preset folder**: empty uses the general video or music folder from **Settings → Downloads**; the field shows that folder as a hint.

On a built-in preset only the embedding options, the audio tidy-up and the folder can be changed; the format is updated with ymd. **Use as the default preset** keeps it selected at the counter.

### Audio tidy-up

Three options to keep a music library in order. They start off and apply once the download finishes:

- **Split artist and title**: if the video title reads “Artist - Song” (a hyphen, en dash or em dash between spaces), “Artist” goes into the artist tag and “Song” into the title tag. Titles shaped differently stay as they are. The file name does not change. Requires **Embed metadata**.
- **Square cover**: crops the thumbnail around its center to its shorter side, so a 1280×720 16:9 image becomes 720×720. Requires **Embed thumbnail**.
- **Even out volume**: normalizes loudness to -14 LUFS (EBU R128) so every song plays at a similar level. The audio is re-encoded with the preset's quality, at 48 kHz.

**Even out volume** is not available with the **Original (no conversion)** format, which keeps the audio as it arrives, without re-encoding it. It is also skipped when the site already serves a file in the chosen format (for example, an `.m4a` for **M4A**): yt-dlp leaves it unconverted and the volume stays the same.

## Playlists

When the link is a playlist, the card shows a thumbnail grid with every entry:

- **All** or **None** select or clear the whole list.
- **From** … **to** and **Select range** pick a stretch.
- <kbd>Shift</kbd> + click marks every entry between two clicks.

Each selected entry goes into the ledger as its own download (“Entry 3 of 12”).

## Download only a section

A video's card (not a playlist's) includes **Section**, which starts closed. Open it to see two fields: **From** and **To**. They take seconds (`90`), `m:ss` (`1:30`) or `h:mm:ss` (`1:02:03`):

- With both fields empty, the whole video is downloaded.
- An empty **From** starts at `0:00`; an empty **To** runs to the end of the video.
- If a time isn't in a valid format, **To** doesn't come after **From**, or the section goes past the end of the video, the field says so and **File it** stays disabled until it's fixed. Until then, **Section** can't be closed.
- With a valid section, **Section** shows it next to its title even when closed (“Section · 1:30–2:45”).

The file name ends with the section, using dots instead of colons so it's valid on every system: `My video [abc123] [1.30-2.45].mp4`. In the ledger, the row shows the section next to the title (“1:30–2:45”).

So the file starts and ends exactly where you asked, ffmpeg re-encodes the video around the cuts, which takes longer than a full download of the same size. While a section downloads, the progress shows no percentage. aria2c isn't used for these downloads even when it's turned on.

Sections aren't available for playlists or in the **Several links** panel. An unfinished download keeps its section when resumed.

## Several links at once

If you paste text with two or more links into the **Link** field (one per line or separated by spaces), the field stays as it is and the **Several links** panel opens:

- The title says how many links will be queued (“3 links”) and the list shows them in the order you pasted them. Repeated links count once.
- Anything that isn't a downloadable link is struck through and marked **Excluded**, with a note saying how many are left out. Up to 200 links fit at a time; any extra ones are reported too.
- They all use the **Video** or **Audio** choice and the **Preset** picked at the counter, and go to the same **Shelf**. With **Ask for the folder on every download**, the folder is asked once for all of them.
- **Whole playlists**: when off, a playlist link downloads only the linked video; when on, each playlist link downloads the whole playlist.
- **Queue 3** (or <kbd>Enter</kbd>) sends them all to the queue; **Cancel** (or <kbd>Esc</kbd>) drops them. A notice sums up how many went in.

The panel's links aren't checked before queueing: each one's title and thumbnail show up in the ledger once yt-dlp starts downloading it. Paste a single link and the counter works as usual.

## The queue

Several downloads run at once. Change the number in **Settings → Downloads → Downloads at once** (between 1 and 8); more at once share the same connection. In the same section:

- **Folders**: video folder, music folder and **Ask for the folder on every download**.
- **File name**: the **Template** uses yt-dlp fields such as `%(title)s`, `%(id)s`, `%(uploader)s` or `%(ext)s`. It must include `%(ext)s`.
- **Skip what's already downloaded**: yt-dlp notes every video in an archive file and never repeats it.
- **Use aria2c**: downloads each file over several connections (install aria2c in Dependencies first).
- **Speed limit**: **No limit** (the default), 1, 2, 5, 10, 20 or 50 MB/s, or **Other…** to type a whole number between 1 and 1000. Each download applies that cap separately, and with aria2c the cap applies to aria2c too. The limit applies to downloads that start after you save it; running ones keep the speed they started with.
- **Notify me when a download ends**: see [Notifications](#notifications).

### Scheduling the start

To leave downloads queued and have them start later (for example, overnight), type a time on the **Ledger** screen next to **Schedule start** and click the button. If that time already passed today, the queue starts tomorrow at that time.

Meanwhile a notice reads “The queue starts at 23:30” (or “tomorrow at …”): queued downloads wait and running ones carry on. **Start now** clears the scheduled time and starts the queue right away. The scheduled time is discarded when you quit ymd.

## Notifications

While ymd is in the background (another window in front, minimized or in the tray), a system notification tells you when a download ends:

- If it was archived, the notification says **Download finished** and the video's title.
- If it failed, it says **Couldn’t download “…”** and why. When you come back to ymd, the **Ledger** opens, where the row explains what to do.
- Downloads that end at about the same time arrive as one notification (“3 downloads finished”; if any failed, it says so too).

With ymd's window in front there is no system notification; the notice appears inside the app. To stop them, turn off **Settings → Downloads → Notify me when a download ends**.

## When closing the window

Clicking the X doesn't quit ymd: it hides in the system tray, next to the clock (on macOS, in the menu bar). Downloads keep going and it answers **Download with ymd** from the browser instantly. The first time, a notification tells you.

- Click the icon or **Open ymd** in its menu: the window comes back.
- **Quit** in its menu: closes ymd completely. Unfinished downloads stop, but they aren't lost: see [Unfinished downloads](#unfinished-downloads).

To make the X quit ymd, turn off **Settings → Advanced → When closing the window → Keep ymd in the system tray** (on macOS, **Keep ymd in the menu bar**). On Linux desktops without a system tray, the X always quits ymd.

## Unfinished downloads

If ymd closes with downloads running or queued (with **Quit**, when the computer shuts down or after a crash), it remembers them. Next time, the **Ledger** shows “N downloads didn’t finish” with their number and title:

- **Resume** puts them back in the queue with the same number. yt-dlp picks up where it left off, without downloading again what it already had.
- **Discard** removes them from the list and deletes their partial files.

Downloads don't resume automatically. Those that used a **Video password** or a **Verification code (2FA)** are listed separately, because ymd never stores that data: paste their link again in **Receive** and enter that data again.

An unfinished download nobody resumes within 14 days is forgotten when ymd starts, along with its partial files.

## The ledger

The **Ledger** screen lists every download in the session, newest first, with its number (**No.**), title, format, size, exact progress in bytes, speed, time left and status. You can filter by status (**Running**, **Queued**, **Archived**, **Failed**) and **Clear finished**. The **Receive** screen shows this session's ledger under the counter.

Each row has its actions: **Cancel**, **Retry**, **Open file**, **Show in folder** and **Remove from ledger**.

- **Retry** doesn't work for a download that used a **Video password** or a **Verification code (2FA)**: ymd forgets them as soon as the download ends. Paste the link again in **Receive** and enter them again.
- ymd can stay in the system tray for days: the ledger keeps the 200 most recent finished downloads and removes older ones by itself. Running and queued downloads are never removed.

## Stamps

Each accession's status shows as a stamp:

| Stamp       | Meaning                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| Queued      | Waiting for its turn.                                                                                             |
| Downloading | yt-dlp is fetching the file.                                                                                      |
| Merging     | ffmpeg joins the video and audio tracks.                                                                          |
| Processing  | Post-processing: thumbnail, metadata, subtitles, SponsorBlock or conversion.                                      |
| Archived    | Done. The file is noted in the [Catalog](/ymd/en/guia/catalogo/).                                                 |
| Failed      | The download didn't complete. The message says what to do; see [Troubleshooting](/ymd/en/solucion-de-problemas/). |
| Canceled    | You canceled it.                                                                                                  |

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
