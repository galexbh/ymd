---
title: Copied link detection
description: How ymd pastes the links you copy, and what it does with the clipboard.
---

When you return to the ymd window after copying a link from a video or audio site, ymd pastes it into the **Receive** counter and checks it. A notice ("YouTube link found on the clipboard") offers **Undo**.

## Modes

Set it in **Settings → Downloads → Clipboard → Detect copied links**:

| Mode             | Behavior                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Off              | ymd doesn't look at the clipboard.                                                                                                                  |
| Known sites only | A link from YouTube, Vimeo, SoundCloud or another known video or audio site is pasted for you when the counter is empty.                            |
| Any link         | Known sites are pasted for you; any other link is suggested ("Use the copied … link?", with **Use** or **Dismiss**) and waits for you to accept it. |

Known sites include YouTube, Vimeo, SoundCloud, TikTok, X, Instagram, Twitch and Bandcamp, among others.

## Privacy

ymd reads the clipboard only when you return to the window, ignores anything that isn't a link and never saves it.
