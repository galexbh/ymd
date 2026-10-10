---
title: Protocolo del puente de cookies
description: Contrato de Native Messaging entre la extensión ymd Cookies y ymd.
tableOfContents: false
---

Contrato compartido por `extension/` y `src-tauri/src/auth/native_host.rs`. Un cambio en uno se hace en el otro en el mismo PR, junto con esta página y su versión en inglés.

<figure class="archify-figure">
  <iframe data-archify="/ymd/diagramas/puente-de-cookies.html" title="Diagrama de secuencia del puente de cookies" loading="lazy"></iframe>
  <figcaption>Un envío completo, desde que cambia una cookie hasta que yt-dlp la usa. <a href="/ymd/diagramas/puente-de-cookies.html" target="_blank" rel="noopener">Abrir el diagrama interactivo, con las fuentes de cada paso</a></figcaption>
</figure>

## Identidad

- Nombre del host nativo: `com.ymd.cookies`
- ID de la extensión (fijado por la `key` del manifiesto): `gicaphbpepkphmeciigjhdpnbcaflfgd`
- ID de la versión de la Chrome Web Store (la tienda asigna el suyo): `hhojlkpllmndkaolmebblijfcjkjpdpi`
- Orígenes permitidos: `chrome-extension://gicaphbpepkphmeciigjhdpnbcaflfgd/` y `chrome-extension://hhojlkpllmndkaolmebblijfcjkjpdpi/`. ymd rechaza cualquier otro.
- `key` del manifiesto (pública, SPKI DER en base64). `extension/src/__tests__/manifest.test.ts` lee este bloque y comprueba que coincide con `extension/manifest.json`:

```
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAleZOXLWNeehtpLVMJ3N2+P25O02a6I+9f2iACBHuQDaqRH6x2PFX8QIRBjGk5Ab8y4kTlJq72+2/NmQ+AUJ93dRt4HZNxBIKlxz2J/pd2o+krs3Xjx8qNX318pb40jmn5Y8gb4IKrKITa26Qm3fuT0cIY0WvoK0qSLynK/wI1FznJ0nELbiDwrnvYHeuEjzUouDF/H1QzzsbtfNp22X0UdiXFTQQjb1k0LgF9rlQCS2OPAgj3JCxxEPYOp7UW+6Cn3/BsHcRPgHEZ/HIYSlJTtNUdSB7cOwzRhvTcRRMQdjEUvTx/T+0dA4n8/0CgShKSk5mPBAauwQfh+OByGarPwIDAQAB
```

La clave privada correspondiente **no** está en el repositorio. Vive en `~/.ymd/extension-key.pem` en la máquina del mantenedor y no se sube a la tienda: la versión de la Chrome Web Store tiene su propio ID, y ymd acepta los dos.

## Transporte

Los navegadores Chromium lanzan el host como `ymd.exe chrome-extension://<id>/ [--parent-window=N]`, un proceso por cada llamada a `chrome.runtime.sendNativeMessage`. Cada mensaje es una longitud en bytes u32 little-endian seguida de JSON en UTF-8, con un máximo de 16 MiB de entrada.

- El host lee exactamente un mensaje, escribe exactamente una respuesta y termina con código 0.
- Si el origen no es el permitido, termina con código 1 sin leer nada.
- Si la trama es ilegible (truncada, o con una longitud de más de 16 MiB), escribe igualmente una respuesta de error y termina con código 1.

## Mensajes (extensión → host)

- `{"type":"hello","version":1}`
  → `{"ok":true,"app":"ymd","appVersion":"0.4.0","protocol":1,"features":["cookies","open"]}`
  - `features` lista los mensajes que entiende este ymd; un ymd anterior no lo envía.
- `{"type":"cookies","version":1,"browser":"brave"|"chrome"|"edge"|"chromium"|"vivaldi"|"opera"|"other","cookies":[Cookie…]}`
  → `{"ok":true,"count":N,"domains":["youtube.com",…]}`
  - `Cookie` refleja `chrome.cookies.Cookie`: `{domain, hostOnly, path, secure, httpOnly, session, expirationDate?, name, value}`. Los campos extra se ignoran.
  - Un `browser` desconocido se registra como `other`.
  - `count` y `domains` describen lo que se escribió. Se omiten las cookies con nombre vacío, con caracteres de control en la ruta, el nombre o el valor, con un dominio que no sea un nombre de host válido, con una ruta que no empiece por `/`, o de más de 4096 bytes (nombre más valor). Si no queda ninguna, la respuesta es un error y se conserva el `cookies.txt` anterior.
  - Más de 10.000 cookies en un mensaje es un error.
- `{"type":"open","version":1,"url":"https://…"}` → `{"ok":true}` («Descargar con ymd»)
  - Solo enlaces web: `http` o `https`, de 2048 caracteres como máximo, sin espacios ni caracteres de control, sin usuario ni contraseña y con un host con punto que no sea una IP. Otro enlace → `{"ok":false,"code":"unsupported_url"}`.
- `version` es opcional; un valor mayor que `1` se rechaza.
- Cualquier fallo → `{"ok":false,"code":"<ErrorCode en snake_case>","detail":"…"}`. El detalle nunca contiene valores de cookies.

## Efectos

- El host escribe `<datos de la app>/auth/cookies.txt` (formato Netscape) de forma atómica, con permisos solo para el usuario y cifrado (ver [Seguridad](#seguridad)).
- Escribe `cookies.meta.json` con `origin: "extension:<browser>"`.
- La app lee ambos con `cookies_info` y `extension_status`.
- `open` lanza `ymd --open-url <url>` y responde enseguida. Si ymd ya está abierto, esa segunda instancia le pasa el enlace y se cierra, y ymd pasa al frente; si no, ymd arranca con él. El enlace aparece en **Recibir** con su ficha. Nunca se descarga nada sin tu clic.

## Seguridad

Cómo cuida el puente tus cookies y los enlaces que envías.

- **Sin red.** Las cookies viajan por Native Messaging, de proceso a proceso. No hay puertos abiertos, servidor ni telemetría.
- **Solo esta extensión habla con el host.** El navegador solo lanza el host para el origen del ID fijo, y el host lo vuelve a comprobar. La extensión no acepta mensajes de otras extensiones ni de páginas web (`externally_connectable` vacío), y solo atiende a su propio popup.
- **El host solo escribe.** Ninguna respuesta devuelve cookies: solo el conteo y los dominios. Quien lograra hablar con el host no podría leer nada.
- **Los enlaces solo se revisan.** «Descargar con ymd» acepta únicamente enlaces web y ymd los muestra en **Recibir**; descargar siempre requiere tu clic.
- **Lo mínimo.** Solo se envían los sitios de la lista. La extensión que trae ymd pide en su manifiesto solo `*://*.youtube.com/*`; el paquete de la Chrome Web Store no pide ninguno. Cada sitio que se agrega pide permiso al navegador, y se rechazan los dominios compartidos por muchos sitios (`co.uk`, `github.io`, `blogspot.com`…), que darían acceso a sitios ajenos.
- **Validación estricta.** Mensajes de 16 MiB como máximo, 10.000 cookies como máximo, y cada cookie con un dominio y una ruta válidos, sin caracteres de control y de 4096 bytes como máximo. Lo que no cumple se descarta.
- **Cifrado en disco.** `cookies.txt` se guarda cifrado con ChaCha20-Poly1305, con una clave aleatoria en el llavero del sistema (Administrador de credenciales, Llavero de macOS o Secret Service). El texto plano solo existe en memoria y en la copia que yt-dlp recibe durante una descarga; esa copia se borra al terminar, y al arrancar ymd si quedó alguna por un cierre forzado. Sin llavero disponible (algunos Linux sin Secret Service), el archivo se guarda sin cifrar, solo para tu usuario, y el log lo indica.
- **La extensión no guarda valores.** En el navegador solo guarda la lista de sitios, el estado y una huella SHA-256 del conjunto.
- **Páginas cerradas.** La política de contenido de la extensión solo permite sus propios archivos y ninguna conexión de red.

### Buenas prácticas

Como cualquier aplicación que guarda sesiones, ymd cuenta con que el equipo esté sano:

- Mantén el sistema operativo y el navegador actualizados.
- Instala ymd y la extensión solo desde las fuentes oficiales: los releases de GitHub y la carpeta que trae ymd.
- Agrega a la lista solo los sitios que necesitas, y usa **Borrar copia** en **Ajustes → Cuentas** cuando ya no la uses.

## Registro del host

ymd se registra como host `com.ymd.cookies` en cada arranque (de forma idempotente, para que el manifiesto apunte siempre al ejecutable actual), en Brave, Edge y Vivaldi si existe su carpeta de datos, y siempre en Chrome y Chromium:

- **Windows:** `HKCU\Software\<fabricante>\NativeMessagingHosts\com.ymd.cookies`, cuyo valor es la ruta del manifiesto JSON del host. HKCU no requiere elevación. Las claves de Chrome y Chromium se escriben aunque esos navegadores no estén instalados: Opera, Arc, Yandex, Whale, Thorium y otros forks las usan como respaldo. El desinstalador borra las claves.
- **macOS y Linux:** el manifiesto JSON se copia en la carpeta `NativeMessagingHosts` de cada navegador.
