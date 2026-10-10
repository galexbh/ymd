# ymd Cookies

Extensión para Brave, Chrome y Edge (Manifest V3) que entrega a ymd, en este mismo equipo, las
cookies de los sitios que tú elijas. Así ymd descarga con tu sesión (videos privados, con
restricción de edad o de miembros) sin tener que leer la base de cookies del navegador.

La guía de uso está en la [documentación de ymd](https://galexbh.github.io/ymd/cookies/extension/).
El contrato con ymd es la página
[Protocolo del puente de cookies](https://galexbh.github.io/ymd/desarrollo/puente-de-cookies/)
(fuente: [`website/src/content/docs/desarrollo/puente-de-cookies.md`](../website/src/content/docs/desarrollo/puente-de-cookies.md)).

## Instalar (modo descomprimido)

ymd trae la extensión ya compilada en su carpeta de recursos. La ruta exacta aparece en
**Ajustes → Cuentas**. Cuando ymd se actualiza, la extensión se actualiza en esa misma carpeta.

### Brave

1. Abre `brave://extensions`.
2. Activa **Modo desarrollador** (arriba a la derecha).
3. Pulsa **Cargar descomprimida** y elige la carpeta de la extensión de ymd (la que contiene
   `manifest.json`).
4. Fija «ymd Cookies» en la barra y ábrela: el sello debe decir **CONECTADA**.

### Chrome y Edge

Los mismos pasos en `chrome://extensions` o `edge://extensions`. Ahí los botones se llaman
«Modo de desarrollador» y «Cargar desempaquetada».

El ID es siempre `gicaphbpepkphmeciigjhdpnbcaflfgd`, porque el manifiesto lleva una clave
pública fija. ymd solo acepta mensajes de ese ID.

Si el sello dice **SIN CONEXIÓN** con «ymd no está instalado o no registró el puente», abre ymd y
activa el puente en Ajustes → Cuentas. Después pulsa «Enviar ahora».

## Qué envía y adónde

- **A quién:** solo al programa nativo `com.ymd.cookies` (ymd) por Native Messaging. El
  navegador lo arranca como un proceso local y le pasa el mensaje por la entrada estándar. No
  hay red, servidor ni telemetría.
- **Qué:** las cookies de los dominios de la lista (por defecto solo `youtube.com`, con sus
  subdominios), con los campos de `chrome.cookies.Cookie`: `domain`, `hostOnly`,
  `path`, `secure`, `httpOnly`, `session`, `expirationDate`, `name` y `value`. También el
  nombre del navegador (`brave`, `chrome`, `edge`…).
- **Cuándo:** 3 s después de que cambie una cookie de la lista, cada 30 min como
  sincronización completa, y al pulsar «Enviar ahora». Solo se envía si el contenido cambió
  (se compara un hash SHA-256).
- **Qué guarda la extensión:** la lista de sitios, el estado (última sincronización, número de
  cookies, dominios y el último error) y el hash. Nunca guarda el valor de una cookie.
- **Qué hace ymd:** escribe `cookies.txt` (formato Netscape) en su carpeta de datos, con
  permisos solo para tu usuario, y lo usa con yt-dlp.

Agregar un sitio pide el permiso del navegador para ese dominio. Quitarlo devuelve ese permiso
(salvo en los dos sitios predeterminados, cuyo permiso es parte del manifiesto).

## Desarrollo

```sh
corepack pnpm ext:build   # extension/dist
corepack pnpm ext:test    # Vitest con un chrome.* falso (src/test/chrome-fake.ts)
corepack pnpm ext:lint    # ESLint + tsc
corepack pnpm ext:zip     # extension/ymd-cookies-extension.zip (ignorado por git)
corepack pnpm ext:e2e     # Playwright: Chromium real + host nativo falso (requiere ext:build)
```

- `src/background.ts` y `src/popup.ts` son solo puntos de entrada; la lógica vive en `src/lib/`
  y recibe `chrome` como dependencia.
- El popup usa los tokens de la app (`src/styles/tokens.css` y `base.css`) y sigue el tema del
  sistema.
- Los textos están en `_locales/es` y `_locales/en`; ambos deben tener las mismas claves (hay
  una prueba).
- Los íconos salen de `src/assets/brand` con `node extension/scripts/render-icons.mjs`.
- El e2e registra un host falso: en Windows con una clave temporal en
  `HKCU\Software\Chromium\NativeMessagingHosts` (se restaura al terminar); en Linux y macOS en
  la carpeta `NativeMessagingHosts` del perfil de prueba y del usuario de Chromium.
