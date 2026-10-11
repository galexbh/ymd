---
title: Cookie bridge protocol
description: The Native Messaging contract between the ymd Cookies extension and ymd.
tableOfContents: false
---

Contract between the extension (`extension/`) and ymd's native host (`src-tauri/src/auth/native_host.rs`).

<figure class="archify-figure">
  <iframe data-archify="/ymd/diagramas/en/cookie-bridge.html" title="Cookie bridge sequence diagram" loading="lazy"></iframe>
  <figcaption>One full send, from a cookie change to yt-dlp using it. <a href="/ymd/diagramas/en/cookie-bridge.html" target="_blank" rel="noopener">Open the interactive diagram, with the sources of each step</a></figcaption>
</figure>

## Identity

- Native host name: `com.ymd.cookies`
- Extension ID (fixed by the manifest `key`): `gicaphbpepkphmeciigjhdpnbcaflfgd`
- Chrome Web Store build ID (the store assigns its own): `hhojlkpllmndkaolmebblijfcjkjpdpi`
- Allowed origins: `chrome-extension://gicaphbpepkphmeciigjhdpnbcaflfgd/` and `chrome-extension://hhojlkpllmndkaolmebblijfcjkjpdpi/`. ymd refuses any other.
- Manifest `key` (public, SPKI DER base64), the same as in `extension/manifest.json`:

```
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAleZOXLWNeehtpLVMJ3N2+P25O02a6I+9f2iACBHuQDaqRH6x2PFX8QIRBjGk5Ab8y4kTlJq72+2/NmQ+AUJ93dRt4HZNxBIKlxz2J/pd2o+krs3Xjx8qNX318pb40jmn5Y8gb4IKrKITa26Qm3fuT0cIY0WvoK0qSLynK/wI1FznJ0nELbiDwrnvYHeuEjzUouDF/H1QzzsbtfNp22X0UdiXFTQQjb1k0LgF9rlQCS2OPAgj3JCxxEPYOp7UW+6Cn3/BsHcRPgHEZ/HIYSlJTtNUdSB7cOwzRhvTcRRMQdjEUvTx/T+0dA4n8/0CgShKSk5mPBAauwQfh+OByGarPwIDAQAB
```

The matching private key is not part of the repository. The Chrome Web Store build doesn't use this key: the store assigns its own ID, and ymd accepts both.

## Transport

Chromium browsers launch the host as `ymd.exe chrome-extension://<id>/ [--parent-window=N]`, one process per `chrome.runtime.sendNativeMessage` call. Each message is a little-endian u32 byte length followed by UTF-8 JSON, 16 MiB max inbound.

- The host reads exactly one message, writes exactly one reply and exits 0.
- If the origin is not the allowed one, it exits 1 without reading.
- If the frame itself is unreadable (truncated, or a length over 16 MiB), it still writes an error reply, then exits 1.

## Messages (extension → host)

- `{"type":"hello","version":1}`
  → `{"ok":true,"app":"ymd","appVersion":"0.4.0","protocol":1}`
- `{"type":"cookies","version":1,"browser":"brave"|"chrome"|"edge"|"chromium"|"vivaldi"|"opera"|"other","extension":"1.4.1","cookies":[Cookie…]}`
  → `{"ok":true,"count":N,"domains":["youtube.com",…]}`
  - `extension` is required: the extension's manifest version (`chrome.runtime.getManifest().version`). Only digits and dots, at most 16 characters, are stored; any other value isn't stored and the sync goes on.
  - `Cookie` mirrors `chrome.cookies.Cookie`: `{domain, hostOnly, path, secure, httpOnly, session, expirationDate?, name, value}`. Extra fields are ignored.
  - An unknown `browser` is recorded as `other`.
  - `count` / `domains` describe what was written: cookies with an empty name, control characters in the path, name or value, a domain that isn't a valid hostname, a path not starting with `/`, or more than 4096 bytes (name plus value) are skipped. If none remain, the reply is an error and the previous `cookies.txt` is kept.
  - More than 10,000 cookies in one message is an error.
- `{"type":"open","version":1,"url":"https://…"}` → `{"ok":true}` (“Download with ymd”)
  - Web links only: `http` or `https`, at most 2048 characters, no spaces or control characters, no username or password, and a host with a dot that isn't an IP. Anything else → `{"ok":false,"code":"unsupported_url"}`.
- `version` is required in every message; a value above `1` is rejected.
- Any failure → `{"ok":false,"code":"<ErrorCode snake_case>","detail":"…"}`. The detail never contains cookie values.
- If handling a message takes longer than 20 s (for example, a keychain prompt nobody answers), the host replies `{"ok":false,"code":"host_failed","detail":"timeout"}` and exits.

## Effects

- The host writes `<app data>/auth/cookies.txt` (Netscape format) atomically, owner-only and encrypted (see [Security](#security)).
- It writes `cookies.meta.json` with `origin: "extension:<browser>"` and, when valid, `extensionVersion`.
- Two browsers can sync at once (one host process each): the host holds an exclusive lock on `auth/.cookies.lock` while it writes `cookies.txt` and `cookies.meta.json`, so both files always come from the same sync.
- `extension_status` returns that version (`lastSync.extensionVersion`) and the version of the extension ymd ships (`bundledVersion`, from the `manifest.json` in its folder). When the synced one is older, the card asks to reload the extension: an unpacked extension doesn't update automatically.
- The app reads both through `cookies_info` / `extension_status`.
- `open` launches `ymd --open-url <url>` and replies right away. If ymd is already open, that second instance hands it the link and exits, and ymd comes to the front; otherwise ymd starts with it. The link shows up in **Receive** with its card. Nothing is ever downloaded without your click.

## Security

How the bridge looks after your cookies and the links you send.

- **No network.** Cookies travel over Native Messaging, process to process. No open ports, no server, no telemetry.
- **Only this extension communicates with the host.** The browser launches the host only for the fixed ID's origin, and the host checks it again. The extension accepts no messages from other extensions or web pages (empty `externally_connectable`), and only answers its own popup.
- **The host only writes.** No reply carries cookies: only the count and the domains. A process that managed to communicate with the host could not retrieve any cookies.
- **Links are only reviewed.** “Download with ymd” accepts web links only and ymd shows them in **Receive**; downloading always takes your click.
- **Minimal permissions.** Only the sites on the list are sent. The extension that ships with ymd asks in its manifest only for `*://*.youtube.com/*`; the Chrome Web Store package asks for none. Each site added asks the browser for permission, and domains shared by many sites (`co.uk`, `github.io`, `blogspot.com`…) are refused, since they'd grant access to unrelated sites.
- **Strict validation.** Messages of at most 16 MiB, at most 10,000 cookies, and each cookie with a valid domain and path, no control characters and at most 4096 bytes. Anything else is dropped.
- **Encrypted at rest.** `cookies.txt` is sealed with ChaCha20-Poly1305 under a random key kept in the system keychain (Credential Manager, macOS Keychain or Secret Service). Plain text only exists in memory and in the copy yt-dlp gets during a download; that copy is deleted when it ends, and at ymd's start-up if one was left by a forced quit. With no keychain available (some Linux setups without a Secret Service) the file is stored unencrypted, owner-only, and the log says so.
- **The extension stores no values.** In the browser it only keeps the site list, the status and a SHA-256 fingerprint of the set.
- **Restrictive content policy.** The extension's content security policy allows only its own files and no network connections.

### Good practices

Like any application that keeps sessions, ymd assumes the computer is not compromised:

- Keep the operating system and the browser up to date.
- Install ymd and the extension only from the official sources: the GitHub releases and the folder that ships with ymd.
- Add only the sites you need to the list, and use **Delete copy** in **Settings → Accounts** once you no longer need the copy.

## Host registration

ymd registers itself as the `com.ymd.cookies` host on every launch (idempotently, so the manifest always points at the current executable) for Brave, Edge and Vivaldi when their user-data folder exists, and always for Chrome and Chromium:

- **Windows:** `HKCU\Software\<vendor>\NativeMessagingHosts\com.ymd.cookies`, whose default value is the path of the host manifest JSON. HKCU needs no elevation. Chrome's and Chromium's keys are written even when those browsers aren't installed: Opera, Arc, Yandex, Whale, Thorium and other forks fall back to them. The uninstaller removes the keys.
- **macOS and Linux:** the manifest JSON is copied into each browser's `NativeMessagingHosts` folder.
