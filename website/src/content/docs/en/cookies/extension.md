---
title: ymd Cookies extension
description: The Chromium-browser extension that hands your cookies to ymd without any network.
---

**ymd Cookies** is a Manifest V3 extension for Chromium browsers: Brave, Chrome, Edge, Opera, Vivaldi and others. It hands ymd, on the same computer, the cookies of the sites you choose, whenever they change. It works with the browser open and without exporting files.

It's how ymd uses a Chromium browser's cookies: ymd doesn't read them directly (see [Chromium browsers](/ymd/en/cookies/navegador/#chromium-browsers)). Choose **Extension** as the **Cookie source** and the card shows the steps.

## Install

ymd includes the extension prebuilt in its resources folder and registers the bridge with the browsers on startup. The **ymd extension for Chromium browsers** card, in **Settings → Accounts**, walks you through the install in your **default browser**: ymd detects it and shows its steps. If your default browser is Firefox, the card offers to use its cookies directly, without the extension.

Steps, once:

1. **Show extension folder**: opens your file manager with ymd's `extension` folder selected. That folder is the one you drag in step 3.
2. **Open [browser] and copy the address**: copies its extensions-page address (for example `brave://extensions`) and opens the browser. Paste it into the address bar (<kbd>Ctrl</kbd>+<kbd>V</kbd>) and press <kbd>Enter</kbd>: browsers don't allow other programs to open that page directly.
3. Turn on **Developer mode**. Drag the folder from step 1 onto the page, or click **Load unpacked** and choose it: it's the one containing `manifest.json`.
4. The extension's welcome page opens. Follow its **Pin the extension to the toolbar** step: click the extensions icon (the puzzle piece), then the pin next to **ymd Cookies**. The page confirms once it's pinned. The extension included with ymd already has YouTube added, so you only need to sign in to YouTube in that browser: ymd will receive the cookies automatically.

When the first sync arrives, the card switches to **Connected**, shows the browser, the last sync, the number of cookies and the **Extension version**, and the cookie source switches to **Extension**. If **YouTube session** reads **Not added**, the extension isn't sending YouTube's cookies: add it from the extension.

The **Extension ID** of the extension included with ymd is always `gicaphbpepkphmeciigjhdpnbcaflfgd`, because the manifest carries a fixed public key. You can check it on the extensions page. If you install the extension from the Chrome Web Store, it has its own ID, `hhojlkpllmndkaolmebblijfcjkjpdpi`. ymd only accepts messages from those two.

When ymd updates, the extension is updated in the same folder, but the browser keeps running the copy it loaded: an unpacked extension doesn't update automatically. When ymd includes a newer version than the one syncing, the card says so: “A new version of the extension is available”. Click **Open [browser] and copy the address**, paste the address and click the reload button on **ymd Cookies**. The notice goes away with the next sync.

### Supported browsers

| Browser                        | Extensions page        |
| ------------------------------ | ---------------------- |
| Brave                          | `brave://extensions`   |
| Chrome, Chromium, Arc, Thorium | `chrome://extensions`  |
| Edge                           | `edge://extensions`    |
| Opera, Opera GX                | `opera://extensions`   |
| Vivaldi                        | `vivaldi://extensions` |
| Yandex                         | `browser://extensions` |

ymd registers the bridge for the most common Chromium browsers. If your browser doesn't detect the extension, you can use [Firefox cookies](/ymd/en/cookies/navegador/) as an alternative.

### Card states

| State     | Meaning                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------- |
| Connected | ymd receives the cookies with nothing else for you to do.                                         |
| Pending   | The bridge is ready. Install the extension; the first sync will arrive automatically.             |
| No bridge | ymd isn't registered with your browsers. Restart ymd; if the state doesn't change, reinstall ymd. |

## Download with ymd

From the browser, no copying or pasting:

- **Right-click** → **Download with ymd** on a link, a video or audio, selected text that is a link, an embedded player (for example, a YouTube or Vimeo video inside another page) or anywhere on the page. If what you clicked isn't a web link (the YouTube video itself, for example, or a `mailto:` link), the page is sent.
- Or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>Y</kbd> to send the open tab. You can change the shortcut at `brave://extensions/shortcuts` (or `chrome://extensions/shortcuts`, depending on your browser).

Browsers don't allow extensions to add options to the address bar menu; right-click the page or use the shortcut.

ymd opens, or comes to the front if it was already open, with the link in **Receive** and its card. If the counter already held another link, ymd asks before replacing it. Nothing downloads until you click **File it**.

## The extension popup

Pin “ymd Cookies” to the browser toolbar and open it:

- The **Bridge to ymd** stamp reads **Connected**, **Offline** or **Error**, with the last send and the number of cookies.
- **YouTube session** tells whether the copy ymd got holds your session: **Active** or **Signed out**. It's determined by the cookies' names, without reading their contents.
- **Send now** forces a send.
- **This page**: shows up only on a site ymd knows (Vimeo, SoundCloud, Twitch…) that isn't on the list; **Use my … session in ymd** adds it in one click. It isn't shown on YouTube once it's added, or on an unknown site.
- **Allowed sites**: the list of sites whose cookies are sent to ymd.
  - In the extension included with ymd, the list starts with `youtube.com`, whose permission comes in the manifest. If you install the extension from the Chrome Web Store, the list starts empty and its welcome page offers **Use YouTube**.
  - **Suggested sites** adds YouTube, Vimeo, SoundCloud or Twitch in one click.
  - For any other domain, **Another site…** opens the **Add a site** field, which folds again once the site is added or when you press <kbd>Esc</kbd>.
  - Each site, with its subdomains, asks the browser for permission when you add it, and removing it withdraws the permission. A site on the list that lost its permission (for example, because you withdrew it in the browser) shows **Allow**.
  - With more than five sites, the list folds: **Show all (N)** reveals the rest and **Show less** folds it again. A site you just added always stays in view.
  - Your YouTube session is stored in `youtube.com` cookies, so adding YouTube gives no access to your Google account.

The extension icon shows an amber **!** when you're signed out of YouTube, and a red one when it can't reach ymd; hovering over it shows the reason. In ymd, **Settings → Accounts** shows the same **YouTube session** and explains how to restore it.

## What it sends and where

- **To whom:** only to the native program `com.ymd.cookies` (ymd), over Native Messaging. The browser starts it as a local process and passes the message on standard input. There's no network, server or telemetry.
- **What:** the cookies of the domains on the list, with the `chrome.cookies.Cookie` fields (`domain`, `hostOnly`, `path`, `secure`, `httpOnly`, `session`, `expirationDate`, `name`, `value`), plus the browser name and the extension version.
- **When:** 3 s after a cookie on the list changes, every 30 min as a full sync, and when you click **Send now**. It only sends when the content changed (a SHA-256 hash is compared).
- **What ymd does:** writes `cookies.txt` (Netscape format) in its data folder, encrypted with a key from the system keychain and readable only by your user, and uses it with yt-dlp.

The full protocol is in [Cookie bridge protocol](/ymd/en/desarrollo/puente-de-cookies/).

## Privacy

- The extension stores the site list, the status (last sync, cookie count, domains and the last error) and the hash. It never stores a cookie value.
- Cookies are sent only to ymd on this computer. They're never sent over the network or to the developer.
- No other extension or web page can communicate with “ymd Cookies”, and ymd never hands cookies back to anyone. Details in [Security](/ymd/en/desarrollo/puente-de-cookies/#security).
- To stop sharing: remove the site from the list or uninstall the extension. **Delete copy**, in **Settings → Accounts**, deletes ymd's `cookies.txt`.

## Troubleshooting

**The stamp says “Offline”: “ymd is not installed or has not registered the bridge”.**
Open ymd once: it registers the bridge on startup. Check that the card in **Settings → Accounts** doesn't say **No bridge**. Then click **Send now**.

**“ymd does not recognize this extension”.**
The loaded extension doesn't have ymd's ID. Remove it and load it from the folder ymd shows in **Settings → Accounts**.

**“ymd closed before answering” or “ymd could not save the cookies”.**
Try again with **Send now**. If the error persists, update ymd.

**The card stays on “Pending”.**
The first sync arrives when a cookie changes or when you click **Send now** in the extension. Check that you're signed in to YouTube in that browser.

**Brave warns about developer-mode extensions on startup.**
Brave shows this warning for any extension loaded in developer mode; it doesn't indicate a problem.

**“A new version of the extension is available”.**
ymd includes a newer version of the extension than the one you have loaded. On the browser's extensions page, click the reload button on **ymd Cookies**. If **Extension version** on the card reads **Older than this feature**, the loaded extension predates this feature: reload it anyway.
