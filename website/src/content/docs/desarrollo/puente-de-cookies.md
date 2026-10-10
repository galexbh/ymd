---
title: Protocolo del puente de cookies
description: Contrato de Native Messaging entre la extensión ymd Cookies y ymd.
---

Contrato compartido por `extension/` y `src-tauri/src/auth/native_host.rs`. Un cambio en uno se hace en el otro en el mismo PR, junto con esta página y su versión en inglés.

## Identidad

- Nombre del host nativo: `com.ymd.cookies`
- ID de la extensión (fijado por la `key` del manifiesto): `gicaphbpepkphmeciigjhdpnbcaflfgd`
- Origen permitido: `chrome-extension://gicaphbpepkphmeciigjhdpnbcaflfgd/`
- `key` del manifiesto (pública, SPKI DER en base64). `extension/src/__tests__/manifest.test.ts` lee este bloque y comprueba que coincide con `extension/manifest.json`:

```
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAleZOXLWNeehtpLVMJ3N2+P25O02a6I+9f2iACBHuQDaqRH6x2PFX8QIRBjGk5Ab8y4kTlJq72+2/NmQ+AUJ93dRt4HZNxBIKlxz2J/pd2o+krs3Xjx8qNX318pb40jmn5Y8gb4IKrKITa26Qm3fuT0cIY0WvoK0qSLynK/wI1FznJ0nELbiDwrnvYHeuEjzUouDF/H1QzzsbtfNp22X0UdiXFTQQjb1k0LgF9rlQCS2OPAgj3JCxxEPYOp7UW+6Cn3/BsHcRPgHEZ/HIYSlJTtNUdSB7cOwzRhvTcRRMQdjEUvTx/T+0dA4n8/0CgShKSk5mPBAauwQfh+OByGarPwIDAQAB
```

La clave privada correspondiente **no** está en el repositorio. Vive en `~/.ymd/extension-key.pem` en la máquina del mantenedor y solo hace falta para subir un CRX empaquetado a la Chrome Web Store con el mismo ID.

## Transporte

Chrome, Brave y Edge lanzan el host como `ymd.exe chrome-extension://<id>/ [--parent-window=N]`, un proceso por cada llamada a `chrome.runtime.sendNativeMessage`. Cada mensaje es una longitud en bytes u32 little-endian seguida de JSON en UTF-8, con un máximo de 16 MiB de entrada.

- El host lee exactamente un mensaje, escribe exactamente una respuesta y termina con código 0.
- Si el origen no es el permitido, termina con código 1 sin leer nada.
- Si la trama es ilegible (truncada, o con una longitud de más de 16 MiB), escribe igualmente una respuesta de error y termina con código 1.

## Mensajes (extensión → host)

- `{"type":"hello","version":1}`
  → `{"ok":true,"app":"ymd","appVersion":"0.2.0","protocol":1}`
- `{"type":"cookies","version":1,"browser":"brave"|"chrome"|"edge"|"chromium"|"vivaldi"|"opera"|"other","cookies":[Cookie…]}`
  → `{"ok":true,"count":N,"domains":["youtube.com",…]}`
  - `Cookie` refleja `chrome.cookies.Cookie`: `{domain, hostOnly, path, secure, httpOnly, session, expirationDate?, name, value}`. Los campos extra se ignoran.
  - Un `browser` desconocido se registra como `other`.
  - `count` y `domains` describen lo que se escribió. Se omiten las cookies con nombre vacío, o con un tabulador o salto de línea en el dominio, la ruta, el nombre o el valor (el formato Netscape no puede representarlas). Si no queda ninguna, la respuesta es un error y se conserva el `cookies.txt` anterior.
- `version` es opcional; un valor mayor que `1` se rechaza.
- Cualquier fallo → `{"ok":false,"code":"<ErrorCode en snake_case>","detail":"…"}`. El detalle nunca contiene valores de cookies.

## Efectos

- El host escribe `<datos de la app>/auth/cookies.txt` (formato Netscape) de forma atómica y con permisos solo para el usuario.
- Escribe `cookies.meta.json` con `origin: "extension:<browser>"`.
- La app lee ambos con `cookies_info` y `extension_status`.

## Registro del host

ymd se registra como host `com.ymd.cookies` en cada arranque (de forma idempotente, para que el manifiesto apunte siempre al ejecutable actual), en Brave, Chrome, Edge, Chromium y Vivaldi, solo si existe su carpeta de datos:

- **Windows:** `HKCU\Software\<fabricante>\NativeMessagingHosts\com.ymd.cookies`, cuyo valor es la ruta del manifiesto JSON del host. HKCU no requiere elevación. El desinstalador borra las claves.
- **macOS y Linux:** el manifiesto JSON se copia en la carpeta `NativeMessagingHosts` de cada navegador.
