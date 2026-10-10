---
title: ymd Cookies extension
description: The Chromium-browser extension that hands your cookies to ymd without any network.
---

**ymd Cookies** is a Manifest V3 extension for Chromium browsers: Brave, Chrome, Edge, Opera, Vivaldi and others. It hands ymd, on the same computer, the cookies of the sites you choose, whenever they change. It works with the browser open and without exporting files.

It's how ymd uses a Chromium browser's cookies: it doesn't read them directly (see [Firefox cookies](/ymd/en/cookies/navegador/#what-about-brave-chrome-or-edge)). Choose **Extension** as the **Cookie source** and the card shows the steps.

## Install

ymd ships the extension prebuilt in its resources folder and registers the bridge with the browsers on startup. The **ymd extension for Chromium browsers** card, in **Settings → Accounts**, walks you through the install in your **default browser**: ymd detects it and shows its steps. If your default browser is Firefox, the card offers to use its cookies directly, since you don't need the extension.

Steps, once:

1. **Show extension folder**: opens your file manager with ymd's `extension` folder selected. That folder is the one you drag in step 3.
2. **Open [browser] and copy the address**: copies its extensions-page address (for example `brave://extensions`) and opens the browser. Paste it into the address bar (Ctrl+V) and press Enter: browsers don't let other programs open that page directly.
3. Turn on **Developer mode**. Drag the folder from step 1 onto the page, or press **Load unpacked** and choose it: it's the one containing `manifest.json`.
4. The extension's welcome page opens. Follow its **Pin the extension to the toolbar** step: click the extensions icon (the puzzle piece), then the pin next to **ymd Cookies**. The page confirms once it's pinned. YouTube is already added in the extension that ships with ymd, so signing in to YouTube in that browser is enough: ymd will receive the cookies on its own.

When the first sync arrives, the card switches to **Connected**, shows the browser, the last sync and the number of cookies, and the cookie source switches to **Extension**. If **YouTube session** reads **Not added**, the extension isn't sending YouTube yet: add it from the extension.

The **Extension ID** is always `gicaphbpepkphmeciigjhdpnbcaflfgd`, because the manifest carries a fixed public key. Check it on the extensions page. The Chrome Web Store build, once published, has its own ID, `hhojlkpllmndkaolmebblijfcjkjpdpi`; ymd only accepts messages from those two.

When ymd updates, the extension is updated in the same folder.

### Supported browsers

| Browser                        | Extensions page        |
| ------------------------------ | ---------------------- |
| Brave                          | `brave://extensions`   |
| Chrome, Chromium, Arc, Thorium | `chrome://extensions`  |
| Edge                           | `edge://extensions`    |
| Opera, Opera GX                | `opera://extensions`   |
| Vivaldi                        | `vivaldi://extensions` |
| Yandex                         | `browser://extensions` |

On Windows, ymd registers the bridge under Brave's, Edge's and Vivaldi's keys, and always under Chrome's and Chromium's, which other Chromium browsers fall back to. If an uncommon browser can't find the bridge, use [Firefox](/ymd/en/cookies/navegador/).

### Card states

| State     | Meaning                                                                                       |
| --------- | --------------------------------------------------------------------------------------------- |
| Connected | ymd receives the cookies with nothing else to do.                                             |
| Pending   | The bridge is ready. Install the extension; the first sync will arrive on its own.            |
| No bridge | ymd hasn't registered with your browsers yet. Restart ymd; if nothing changes, reinstall ymd. |

## Download with ymd

From the browser, no copying or pasting:

- **Right-click** → **Download with ymd** on a link, a video or audio, selected text that is a link, an embedded player (for example, a YouTube or Vimeo video inside another page) or anywhere on the page. If what you clicked isn't a web link (the YouTube video itself, for example, or a `mailto:` link), the page is sent.
- Or press **Alt+Shift+Y** to send the open tab. You can change the shortcut at `brave://extensions/shortcuts` (or `chrome://extensions/shortcuts`, depending on your browser).

The address bar's own menu belongs to the browser: no extension can add entries there. Right-click the page or use the shortcut instead.

ymd opens, or comes to the front if it was already open, with the link in **Receive** and its card. If the counter already held another link, ymd asks before replacing it. Nothing downloads until you click **File it**.

## The extension popup

Pin "ymd Cookies" to the browser toolbar and open it:

- The **Bridge to ymd** stamp reads **Connected**, **Offline** or **Error**, with the last send and the number of cookies.
- **YouTube session** tells whether the copy ymd got holds your session: **Active** or **Signed out**. It goes by the cookies' names, without looking at their contents.
- **Send now** forces a send.
- **This page**: shows up only on a site ymd knows (Vimeo, SoundCloud, Twitch…) that isn't on the list yet; **Use my … session in ymd** adds it in one click. On YouTube once it's added, or on an unknown site, it isn't shown.
- **Allowed sites**: in the extension that ships with ymd, it starts with `youtube.com`, whose permission comes in the manifest. The Chrome Web Store version starts empty and its welcome page offers **Use YouTube**. **Suggested sites** adds YouTube, Vimeo, SoundCloud or Twitch in one click, and **Add a site** takes any other domain. Each site, with its subdomains, asks the browser for permission at that moment, and removing it gives the permission back. A site on the list that lost its permission (for example, because you withdrew it in the browser) shows **Allow**. With more than five sites, the list folds: **Show all (N)** reveals the rest and **Show less** folds it again. A site you just added always stays in view. Your YouTube session lives in `youtube.com` cookies, so adding YouTube gives no access to your Google account.

The extension icon shows an amber **!** when you're signed out of YouTube, and a red one when it can't reach ymd; hovering explains which. In ymd, **Settings → Accounts** shows the same **YouTube session** and tells you how to get it back.

## What it sends and where

- **To whom:** only to the native program `com.ymd.cookies` (ymd), over Native Messaging. The browser starts it as a local process and passes the message on standard input. There's no network, server or telemetry.
- **What:** the cookies of the domains on the list, with the `chrome.cookies.Cookie` fields (`domain`, `hostOnly`, `path`, `secure`, `httpOnly`, `session`, `expirationDate`, `name`, `value`), plus the browser name.
- **When:** 3 s after a cookie on the list changes, every 30 min as a full sync, and when you click **Send now**. It only sends when the content changed (a SHA-256 hash is compared).
- **What ymd does:** writes `cookies.txt` (Netscape format) in its data folder, encrypted with a key from the system keychain and readable only by your user, and uses it with yt-dlp.

The full protocol is in [Cookie bridge protocol](/ymd/en/desarrollo/puente-de-cookies/).

## Privacy

- The extension stores the site list, the status (last sync, cookie count, domains and the last error) and the hash. It never stores a cookie value.
- Cookies travel only to ymd on this computer. They're never sent over the network or to the developer.
- No other extension or web page can talk to “ymd Cookies”, and ymd never hands cookies back to anyone. Details in [Security](/ymd/en/desarrollo/puente-de-cookies/#security).
- To stop sharing: remove the site from the list or uninstall the extension. **Delete copy**, in **Settings → Accounts**, deletes ymd's `cookies.txt`.

## Troubleshooting

**The stamp says "Offline": "ymd is not installed or has not registered the bridge".**
Open ymd once: it registers the bridge on startup. Check that the card in **Settings → Accounts** doesn't say **No bridge**. Then click **Send now**.

**"ymd does not recognize this extension".**
The loaded extension doesn't have ymd's ID. Remove it and load it from the folder ymd shows in **Settings → Accounts**.

**"ymd closed before answering" or "ymd could not save the cookies".**
Try again with **Send now**. If it keeps happening, update ymd.

**The card stays on "Pending".**
The first sync arrives when a cookie changes or when you click **Send now** in the extension. Check that you're signed in to YouTube in that browser.

**Brave warns about developer-mode extensions on startup.**
That's expected: the extension is loaded unpacked because it isn't published in a store yet.

**"This build doesn't include the extension folder".**
Only happens in development mode. Build the extension with `pnpm ext:build` and load it from `extension/dist`.
