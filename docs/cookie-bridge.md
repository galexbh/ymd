# Cookie bridge: ymd Cookies extension ↔ ymd (Native Messaging)

Contract shared by `extension/` and `src-tauri/src/auth/native_host.rs`. Change both in the same PR.

## Identity

- Native host name: `com.ymd.cookies`
- Extension ID (fixed by the manifest `key`): `gicaphbpepkphmeciigjhdpnbcaflfgd`
- Allowed origin: `chrome-extension://gicaphbpepkphmeciigjhdpnbcaflfgd/`
- Manifest `key` (public, SPKI DER base64):

```
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAleZOXLWNeehtpLVMJ3N2+P25O02a6I+9f2iACBHuQDaqRH6x2PFX8QIRBjGk5Ab8y4kTlJq72+2/NmQ+AUJ93dRt4HZNxBIKlxz2J/pd2o+krs3Xjx8qNX318pb40jmn5Y8gb4IKrKITa26Qm3fuT0cIY0WvoK0qSLynK/wI1FznJ0nELbiDwrnvYHeuEjzUouDF/H1QzzsbtfNp22X0UdiXFTQQjb1k0LgF9rlQCS2OPAgj3JCxxEPYOp7UW+6Cn3/BsHcRPgHEZ/HIYSlJTtNUdSB7cOwzRhvTcRRMQdjEUvTx/T+0dA4n8/0CgShKSk5mPBAauwQfh+OByGarPwIDAQAB
```

The matching private key is **not** in the repo. It lives at `~/.ymd/extension-key.pem` on the maintainer's machine and is needed only to upload a packed CRX to the Chrome Web Store with the same ID.

## Transport

Chrome/Brave/Edge launch the host as `ymd.exe chrome-extension://<id>/ [--parent-window=N]`, one process per `chrome.runtime.sendNativeMessage` call. Each message is a little-endian u32 byte length followed by UTF-8 JSON. Max 16 MiB inbound. The host reads exactly one message, writes exactly one reply and exits 0. If the origin is not the allowed one, it exits 1 without reading. If the frame itself is unreadable (truncated, or a length over 16 MiB) it still writes an error reply, then exits 1.

## Messages (extension → host)

- `{"type":"hello","version":1}`
  → `{"ok":true,"app":"ymd","appVersion":"0.2.0","protocol":1}`
- `{"type":"cookies","version":1,"browser":"brave"|"chrome"|"edge"|"chromium"|"vivaldi"|"opera"|"other","cookies":[Cookie…]}`
  → `{"ok":true,"count":N,"domains":["youtube.com",…]}`
  - `Cookie` mirrors `chrome.cookies.Cookie`: `{domain, hostOnly, path, secure, httpOnly, session, expirationDate?, name, value}`. Extra fields are ignored.
  - An unknown `browser` is recorded as `other`.
  - `count` / `domains` describe what was written: cookies with an empty name, or a tab or line break in the domain, path, name or value, are skipped (Netscape cannot represent them). If none remain, the reply is an error and the previous `cookies.txt` is kept.
- `version` is optional; a value above `1` is rejected.
- Any failure → `{"ok":false,"code":"<ErrorCode snake_case>","detail":"…"}` (the detail never contains cookie values).

## Effects

- The host writes `<app data>/auth/cookies.txt` (Netscape format) atomically with owner-only permissions.
- It writes `cookies.meta.json` with `origin: "extension:<browser>"`.
- The app reads both through `cookies_info` / `extension_status`.
