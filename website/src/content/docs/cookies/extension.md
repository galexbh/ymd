---
title: Extensión ymd Cookies
description: La extensión para navegadores Chromium que entrega tus cookies a ymd sin red.
---

**ymd Cookies** es una extensión (Manifest V3) para navegadores Chromium: Brave, Chrome, Edge, Opera, Vivaldi y otros. Entrega a ymd, en el mismo equipo, las cookies de los sitios que elijas, cada vez que cambian. Funciona con el navegador abierto y sin exportar archivos.

En Windows es la vía recomendada para navegadores Chromium, que cifran sus cookies de forma que yt-dlp no puede leerlas (ver [Cookies del navegador](/ymd/cookies/navegador/)).

## Instalar

ymd trae la extensión ya compilada en su carpeta de recursos y registra el puente con los navegadores al arrancar. La tarjeta **Extensión de ymd para navegadores Chromium**, en **Ajustes → Cuentas**, guía la instalación en tu **navegador predeterminado**: ymd lo detecta y muestra sus pasos. Si tu navegador predeterminado es Firefox, la tarjeta te ofrece usar sus cookies directamente, porque no necesitas la extensión.

Pasos, una sola vez:

1. **Mostrar la carpeta de la extensión**: abre el Explorador con la carpeta `extension` de ymd seleccionada. Esa carpeta es la que arrastras en el paso 3.
2. **Abrir [navegador] y copiar la dirección**: copia la dirección de su página de extensiones (por ejemplo `brave://extensions`) y abre el navegador. Pégala en la barra de direcciones (Ctrl+V) y pulsa Enter: los navegadores no dejan que otro programa abra esa página directamente.
3. Activa **Modo de desarrollador**. Arrastra a la página la carpeta del paso 1, o pulsa **Cargar descomprimida** (en Chrome y Edge, «Cargar desempaquetada») y elígela: es la que contiene `manifest.json`.
4. Inicia sesión en YouTube en ese navegador. ymd recibirá las cookies solo.

Cuando llega la primera sincronización, la tarjeta pasa a **Conectada**, muestra el navegador, la última sincronización y el número de cookies, y el origen de las cookies cambia a **Archivo cookies.txt**.

El **ID de la extensión** es siempre `gicaphbpepkphmeciigjhdpnbcaflfgd`, porque el manifiesto lleva una clave pública fija. Compruébalo en la página de extensiones: ymd solo acepta mensajes de ese ID.

Cuando ymd se actualiza, la extensión se actualiza en la misma carpeta.

### Navegadores compatibles

| Navegador                      | Página de extensiones  |
| ------------------------------ | ---------------------- |
| Brave                          | `brave://extensions`   |
| Chrome, Chromium, Arc, Thorium | `chrome://extensions`  |
| Edge                           | `edge://extensions`    |
| Opera, Opera GX                | `opera://extensions`   |
| Vivaldi                        | `vivaldi://extensions` |
| Yandex                         | `browser://extensions` |

En Windows, ymd registra el puente en las claves de Brave, Edge y Vivaldi, y siempre en las de Chrome y Chromium, que el resto de navegadores Chromium usa como respaldo. Si un navegador poco común no encuentra el puente, usa el [archivo cookies.txt](/ymd/cookies/cookies-txt/).

### Estados de la tarjeta

| Estado     | Significado                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| Conectada  | ymd recibe las cookies sin que hagas nada más.                                                       |
| Pendiente  | El puente está listo. Instala la extensión; la primera sincronización llegará sola.                  |
| Sin puente | ymd aún no se registró en tus navegadores. Reinicia ymd; si sigue igual, usa el archivo cookies.txt. |

## La ventana de la extensión

Fija «ymd Cookies» en la barra del navegador y ábrela:

- El sello **Puente con ymd** dice **Conectada**, **Sin conexión** o **Error**, con el último envío y el número de cookies.
- **Enviar ahora** fuerza un envío.
- **Sitios permitidos**: por defecto solo `youtube.com`, con sus subdominios. La sesión de YouTube vive en sus propias cookies, así que la extensión no lee las de tu cuenta de Google. **Agregar un sitio** (por ejemplo `vimeo.com`) pide el permiso del navegador para ese dominio; quitarlo devuelve el permiso.

## Qué envía y adónde

- **A quién:** solo al programa nativo `com.ymd.cookies` (ymd), por Native Messaging. El navegador lo arranca como un proceso local y le pasa el mensaje por la entrada estándar. No hay red, servidor ni telemetría.
- **Qué:** las cookies de los dominios de la lista, con los campos de `chrome.cookies.Cookie` (`domain`, `hostOnly`, `path`, `secure`, `httpOnly`, `session`, `expirationDate`, `name`, `value`), y el nombre del navegador.
- **Cuándo:** 3 s después de que cambie una cookie de la lista, cada 30 min como sincronización completa, y al pulsar **Enviar ahora**. Solo se envía si el contenido cambió (se compara un hash SHA-256).
- **Qué hace ymd:** escribe `cookies.txt` (formato Netscape) en su carpeta de datos, con permisos solo para tu usuario, y lo usa con yt-dlp.

El protocolo completo está en [Protocolo del puente de cookies](/ymd/desarrollo/puente-de-cookies/).

## Privacidad

- La extensión guarda la lista de sitios, el estado (última sincronización, número de cookies, dominios y el último error) y el hash. Nunca guarda el valor de una cookie.
- Las cookies viajan solo a ymd en este equipo. No se envían por red ni al desarrollador.
- Para dejar de compartir: quita el sitio de la lista o desinstala la extensión. **Borrar copia**, en **Ajustes → Cuentas**, borra el `cookies.txt` de ymd.

## Solución de problemas

**El sello dice «Sin conexión»: «ymd no está instalado o no registró el puente».**
Abre ymd una vez: registra el puente al arrancar. Revisa que la tarjeta en **Ajustes → Cuentas** no diga **Sin puente**. Después pulsa **Enviar ahora**.

**«ymd no reconoce esta extensión».**
La extensión cargada no tiene el ID de ymd. Quítala y cárgala desde la carpeta que indica ymd en **Ajustes → Cuentas**.

**«ymd se cerró antes de responder» o «ymd no pudo guardar las cookies».**
Vuelve a intentarlo con **Enviar ahora**. Si se repite, actualiza ymd.

**La tarjeta sigue en «Pendiente».**
La primera sincronización llega cuando cambia una cookie o al pulsar **Enviar ahora** en la extensión. Comprueba que iniciaste sesión en YouTube en ese navegador.

**Brave avisa de extensiones en modo desarrollador al iniciar.**
Es esperado: la extensión se carga descomprimida porque aún no está publicada en una tienda.

**«Esta compilación no incluye la carpeta de la extensión».**
Solo ocurre en modo desarrollo. Compila la extensión con `pnpm ext:build` y cárgala desde `extension/dist`.
