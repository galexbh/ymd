# ymd Cookies: Chrome Web Store listing (draft)

Prepared for a future submission. Nothing has been submitted yet.

The store assigns its own extension ID. ymd accepts both IDs: the unpacked one (fixed by the
manifest `key`) and the store one (`STORE_EXTENSION_ID` in
`src-tauri/src/auth/native_host.rs`), so no private key has to be uploaded.

## Publishing checklist

1. Developer account at <https://chrome.google.com/webstore/devconsole> (one-time USD 5 fee).
2. `pnpm ext:build && pnpm ext:zip:store` → `extension/ymd-cookies-store.zip` (no `key`; also
   attached to every GitHub release).
3. **New item** → upload the zip. Fill in the listing below (es default, en), category
   Productivity.
4. **Privacy:** single purpose, permission justifications and data usage from this file. Privacy
   policy URL: <https://galexbh.github.io/ymd/en/cookies/privacidad-extension/>.
5. **Graphics:** `pnpm ext:shots` writes JPEGs (24-bit, no alpha) to `extension/store/`:
   `screenshot-<es|en>-<light|dark>.jpg` (1280×800), `tile-small.jpg` (440×280) and
   `tile-marquee.jpg` (1400×560). The 128×128 icon is `extension/icons/icon-128.png`.
6. Visibility: **Unlisted** is enough (installable by link and from ymd).
7. Submit for review. Once published, note the item ID and set `STORE_EXTENSION_ID` to it
   (phase 2: preinstall from the ymd installer and point the card at the store).

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

- Solo envía las cookies de los sitios que tú agregues; no trae ninguno de serie.
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

- It only sends cookies of the sites you add; none come preset.
- They travel only to ymd over Native Messaging: a local process, no network, no servers.
- They update on their own when they change, and every 30 minutes.
- You can add or remove sites; each one asks for its own permission.
- It never stores cookie values: only the time of the last send, how many there were, and a
  hash to tell whether they changed.

Requires ymd installed on the same computer.

## Single purpose

Connect this browser to the ymd desktop application on the same computer so it can download
media: pass the cookies of user-selected sites (so ymd downloads with the user's own session) and,
on request, the link the user wants to download.

## Permission justifications

| Permission                         | Why it is needed                                                                                                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cookies`                          | Reads the cookies of the sites on the user's list, which is the extension's only purpose.                                                                                                                                                                    |
| `nativeMessaging`                  | Sends those cookies to the ymd desktop app (`com.ymd.cookies`) on the same computer. This is the only destination; there is no network transport.                                                                                                            |
| `storage`                          | Keeps the user's list of sites, the last-sync status shown in the popup and a SHA-256 hash used to skip unchanged sends. Cookie values are never stored.                                                                                                     |
| `alarms`                           | Runs a full sync every 30 minutes so ymd stays current even if a change event was missed while the service worker was asleep.                                                                                                                                |
| `contextMenus`                     | Adds one entry, «Download with ymd», on links, media and pages, which sends that link to ymd on the user's click.                                                                                                                                            |
| `activeTab`                        | Reads the address of the open tab only while the user has the popup open, for «Download with ymd» and «Use my … session» on that page. No other tab is read.                                                                                                 |
| Optional host permission `*://*/*` | No site is granted at install. When the user adds a site, the extension requests only that domain (`*://*.<domain>/*`), as `chrome.cookies.getAll` needs, and gives it back when they remove it. The extension injects no scripts and reads no page content. |

**Remote code:** none. All code ships in the package; the CSP allows only the extension's own files (`default-src 'none'; script-src 'self'`) and no network connections.

## Privacy policy

**ymd Cookies — Privacy policy**

ymd Cookies handles authentication data (cookies) only to pass it to the ymd desktop
application on the same computer.

- **What is collected:** the cookies of the sites you add to the list (none by
  default): name, value, domain, path, expiry and security flags, plus the name of the
  browser; with «Download with ymd», the link you picked.
- **Where it goes:** only to the ymd application installed on your computer, through the
  browser's Native Messaging channel. It is never sent over the network, never sent to the
  developer, and never shared with or sold to third parties.
- **What is stored by the extension:** your list of sites, the time and size of the last
  transfer, the last error message, and a one-way hash of the cookie set. Cookie values are not
  stored by the extension.
- **What ymd stores:** ymd writes the cookies to a file in its own data folder, encrypted with a
  key from the system keychain and readable only by your user account, and uses it solely to run yt-dlp on your behalf. Removing a site from the
  list, uninstalling the extension or deleting ymd's data folder stops or removes this.
- **Analytics and tracking:** none.
- **Contact:** open an issue in the ymd repository.

### Data usage disclosures (Chrome Web Store form)

- Collects: **Authentication information** (cookies).
- Not sold to third parties; not used or transferred for purposes unrelated to the single
  purpose; not used for creditworthiness or lending.
