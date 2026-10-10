# ymd Cookies: Chrome Web Store listing (draft)

Prepared for a future submission. Nothing has been submitted. To publish with the same ID as the
unpacked build, the package must be signed with the private key kept at
`~/.ymd/extension-key.pem` on the maintainer's machine (see the
[cookie bridge protocol](https://galexbh.github.io/ymd/en/desarrollo/puente-de-cookies/), source
`website/src/content/docs/en/desarrollo/puente-de-cookies.md`).

## Listing

- **Name:** ymd Cookies
- **Category:** Productivity
- **Languages:** Spanish (default), English

### Short description (≤ 132 characters)

- es: Entrega a ymd, en este equipo, las cookies de los sitios que elijas para descargar con tu sesión.
- en: Hands ymd, on this computer, the cookies of the sites you choose so it downloads with your session.

### Detailed description

**es**

ymd Cookies conecta tu navegador con ymd, el programa de escritorio para descargar videos con
yt-dlp. Cuando un video necesita tu sesión (privado, con restricción de edad o solo para
miembros), ymd necesita tus cookies. Esta extensión se las entrega directamente, en tu equipo,
sin que ymd tenga que leer la base de datos del navegador.

- Solo envía las cookies de los sitios de tu lista (por defecto YouTube y Google).
- Viajan únicamente a ymd por Native Messaging: un proceso local, sin red ni servidores.
- Se actualizan solas cuando cambian, y cada 30 minutos.
- Puedes agregar o quitar sitios; cada uno pide su propio permiso.
- Nunca guarda los valores de las cookies: solo la fecha del último envío, cuántas fueron y un
  hash para saber si cambiaron.

Requiere ymd instalado en el mismo equipo.

**en**

ymd Cookies connects your browser to ymd, the desktop app for downloading videos with yt-dlp.
When a video needs your session (private, age-restricted or members-only), ymd needs your
cookies. This extension hands them over directly, on your computer, so ymd never has to read the
browser's cookie database.

- It only sends cookies of the sites on your list (YouTube and Google by default).
- They travel only to ymd over Native Messaging: a local process, no network, no servers.
- They update on their own when they change, and every 30 minutes.
- You can add or remove sites; each one asks for its own permission.
- It never stores cookie values: only the time of the last send, how many there were, and a
  hash to tell whether they changed.

Requires ymd installed on the same computer.

## Single purpose

Pass the cookies of user-selected sites from this browser to the ymd desktop application on the
same computer, so ymd can download media with the user's own session.

## Permission justifications

| Permission                            | Why it is needed                                                                                                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cookies`                             | Reads the cookies of the sites on the user's list, which is the extension's only purpose.                                                                                                                                |
| `nativeMessaging`                     | Sends those cookies to the ymd desktop app (`com.ymd.cookies`) on the same computer. This is the only destination; there is no network transport.                                                                        |
| `storage`                             | Keeps the user's list of sites, the last-sync status shown in the popup and a SHA-256 hash used to skip unchanged sends. Cookie values are never stored.                                                                 |
| `alarms`                              | Runs a full sync every 30 minutes so ymd stays current even if a change event was missed while the service worker was asleep.                                                                                            |
| Host permission `*://*.youtube.com/*` | The default site. A YouTube session lives in .youtube.com cookies, so no Google account cookies are read. Needed by `chrome.cookies.getAll` for that domain. The extension injects no scripts and reads no page content. |
| Optional host permission `*://*/*`    | Lets the user add another site (for example vimeo.com). It is requested per domain (`*://*.<domain>/*`) only when the user adds that site, and revoked when they remove it.                                              |

**Remote code:** none. All code ships in the package; the CSP is `script-src 'self'`.

## Privacy policy

**ymd Cookies — Privacy policy**

ymd Cookies handles authentication data (cookies) only to pass it to the ymd desktop
application on the same computer.

- **What is collected:** the cookies of the sites on the list that you control (YouTube and
  Google by default): name, value, domain, path, expiry and security flags, plus the name of the
  browser.
- **Where it goes:** only to the ymd application installed on your computer, through the
  browser's Native Messaging channel. It is never sent over the network, never sent to the
  developer, and never shared with or sold to third parties.
- **What is stored by the extension:** your list of sites, the time and size of the last
  transfer, the last error message, and a one-way hash of the cookie set. Cookie values are not
  stored by the extension.
- **What ymd stores:** ymd writes the cookies to a file in its own data folder, readable only by
  your user account, and uses it solely to run yt-dlp on your behalf. Removing a site from the
  list, uninstalling the extension or deleting ymd's data folder stops or removes this.
- **Analytics and tracking:** none.
- **Contact:** open an issue in the ymd repository.

### Data usage disclosures (Chrome Web Store form)

- Collects: **Authentication information** (cookies).
- Not sold to third parties; not used or transferred for purposes unrelated to the single
  purpose; not used for creditworthiness or lending.
