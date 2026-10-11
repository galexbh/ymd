---
title: Extensión ymd Cookies
description: La extensión para navegadores Chromium que entrega tus cookies a ymd sin red.
---

**ymd Cookies** es una extensión (Manifest V3) para navegadores Chromium: Brave, Chrome, Edge, Opera, Vivaldi y otros. Entrega a ymd, en el mismo equipo, las cookies de los sitios que elijas, cada vez que cambian. Funciona con el navegador abierto y sin exportar archivos.

Es la forma de usar las cookies de un navegador Chromium: ymd no las lee directamente (ver [Navegadores Chromium](/ymd/cookies/navegador/#navegadores-chromium)). Elige **Extensión** como **Origen de las cookies** y la tarjeta muestra los pasos.

## Instalar

ymd incluye la extensión ya compilada en su carpeta de recursos y registra el puente con los navegadores al arrancar. La tarjeta **Extensión de ymd para navegadores Chromium**, en **Ajustes → Cuentas**, guía la instalación en tu **navegador predeterminado**: ymd lo detecta y muestra sus pasos. Si tu navegador predeterminado es Firefox, la tarjeta ofrece usar sus cookies directamente, sin la extensión.

Pasos, una sola vez:

1. **Mostrar la carpeta de la extensión**: abre el explorador de archivos con la carpeta `extension` de ymd seleccionada. Esa carpeta es la que arrastras en el paso 3.
2. **Abrir [navegador] y copiar la dirección**: copia la dirección de su página de extensiones (por ejemplo `brave://extensions`) y abre el navegador. Pégala en la barra de direcciones (<kbd>Ctrl</kbd>+<kbd>V</kbd>) y pulsa <kbd>Enter</kbd>: los navegadores no permiten que otros programas abran esa página directamente.
3. Activa **Modo de desarrollador**. Arrastra a la página la carpeta del paso 1, o pulsa **Cargar descomprimida** (en Chrome y Edge, «Cargar desempaquetada») y elígela: es la que contiene `manifest.json`.
4. Se abre la página de bienvenida de la extensión. Sigue su paso **Fija la extensión en la barra**: pulsa el icono de extensiones (la pieza de rompecabezas) y luego la chincheta junto a **ymd Cookies**. La página confirma cuando queda fijada. La extensión que incluye ymd ya tiene YouTube agregado, así que solo necesitas iniciar sesión en YouTube en ese navegador: ymd recibirá las cookies automáticamente.

Cuando llega la primera sincronización, la tarjeta pasa a **Conectada**, muestra el navegador, la última sincronización, el número de cookies y la **Versión de la extensión**, y el origen de las cookies cambia a **Extensión**. Si **Sesión de YouTube** dice **Sin agregar**, la extensión no está enviando las cookies de YouTube: agrégalo desde la extensión.

El **ID de la extensión** que incluye ymd es siempre `gicaphbpepkphmeciigjhdpnbcaflfgd`, porque el manifiesto lleva una clave pública fija. Puedes comprobarlo en la página de extensiones. Si instalas la extensión desde la Chrome Web Store, tiene su propio ID, `hhojlkpllmndkaolmebblijfcjkjpdpi`. ymd solo acepta mensajes de esos dos.

Cuando ymd se actualiza, la extensión se actualiza en la misma carpeta, pero el navegador sigue usando la copia que cargó: una extensión descomprimida no se actualiza automáticamente. Si ymd incluye una versión más reciente que la que sincroniza, la tarjeta lo indica: «Hay una versión nueva de la extensión». Pulsa **Abrir [navegador] y copiar la dirección**, pega la dirección y pulsa el botón de recargar de **ymd Cookies**. El aviso desaparece con la siguiente sincronización.

### Navegadores compatibles

| Navegador                      | Página de extensiones  |
| ------------------------------ | ---------------------- |
| Brave                          | `brave://extensions`   |
| Chrome, Chromium, Arc, Thorium | `chrome://extensions`  |
| Edge                           | `edge://extensions`    |
| Opera, Opera GX                | `opera://extensions`   |
| Vivaldi                        | `vivaldi://extensions` |
| Yandex                         | `browser://extensions` |

ymd registra el puente para los navegadores Chromium más comunes. Si tu navegador no detecta la extensión, puedes usar como alternativa las [cookies de Firefox](/ymd/cookies/navegador/).

### Estados de la tarjeta

| Estado     | Significado                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| Conectada  | ymd recibe las cookies sin que tengas que hacer nada más.                                             |
| Pendiente  | El puente está listo. Instala la extensión; la primera sincronización llegará automáticamente.        |
| Sin puente | ymd no está registrado en tus navegadores. Reinicia ymd; si el estado no cambia, vuelve a instalarlo. |

## Descargar con ymd

Desde el navegador, sin copiar ni pegar:

- **Clic derecho** → **Descargar con ymd** en un enlace, un video o audio, un texto seleccionado que sea un enlace, un reproductor incrustado (por ejemplo, un video de YouTube o Vimeo dentro de otra página) o en cualquier parte de la página. Si lo que pulsaste no es un enlace web (el video de YouTube, por ejemplo, o un enlace `mailto:`), se envía la página.
- O pulsa <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>Y</kbd> para enviar la pestaña abierta. Puedes cambiar el atajo en `brave://extensions/shortcuts` (o `chrome://extensions/shortcuts`, según tu navegador).

Los navegadores no permiten a las extensiones añadir opciones al menú de la barra de direcciones; usa el clic derecho en la página o el atajo.

ymd se abre, o pasa al frente si ya estaba abierto, con el enlace en **Recibir** y su ficha. Si el mostrador ya tenía otro enlace, ymd te pregunta antes de cambiarlo. No se descarga nada hasta que pulsas **Ingresar**.

## La ventana de la extensión

Fija «ymd Cookies» en la barra del navegador y ábrela:

- El sello **Puente con ymd** dice **Conectada**, **Sin conexión** o **Error**, con el último envío y el número de cookies.
- **Sesión de YouTube** indica si la copia que recibió ymd tiene tu sesión: **Activa** o **Cerrada**. Se determina por el nombre de las cookies, sin leer su contenido.
- **Enviar ahora** fuerza un envío.
- **Esta página**: aparece solo si estás en un sitio que ymd conoce (Vimeo, SoundCloud, Twitch…) y que no está en la lista; **Usar mi sesión de …** lo agrega con un clic. No se muestra en YouTube si ya está agregado, ni en un sitio desconocido.
- **Sitios permitidos**: la lista de sitios cuyas cookies se envían a ymd.
  - En la extensión que incluye ymd, la lista empieza con `youtube.com`, cuyo permiso viene en el manifiesto. Si instalas la extensión desde la Chrome Web Store, la lista empieza vacía y su página de bienvenida ofrece **Usar YouTube**.
  - **Sitios sugeridos** agrega YouTube, Vimeo, SoundCloud o Twitch con un clic.
  - Para cualquier otro dominio, **Otro sitio…** abre el campo **Agregar un sitio**, que se vuelve a plegar al agregar el sitio o al pulsar <kbd>Esc</kbd>.
  - Cada sitio, con sus subdominios, pide el permiso del navegador al agregarlo, y quitarlo retira el permiso. Si un sitio de la lista perdió su permiso (por ejemplo, porque lo retiraste en el navegador), muestra **Permitir**.
  - Con más de cinco sitios, la lista se pliega: **Mostrar todos (N)** muestra el resto y **Mostrar menos** la vuelve a plegar. Un sitio recién agregado siempre queda a la vista.
  - La sesión de YouTube está en las cookies de `youtube.com`, así que agregar YouTube no da acceso a tu cuenta de Google.

El icono de la extensión muestra **!** en ámbar cuando tu sesión de YouTube está cerrada, y en rojo cuando no puede comunicarse con ymd; al pasar el puntero indica el motivo. En ymd, **Ajustes → Cuentas** muestra la misma **Sesión de YouTube** e indica cómo recuperarla.

## Qué envía y adónde

- **A quién:** solo al programa nativo `com.ymd.cookies` (ymd), por Native Messaging. El navegador lo arranca como un proceso local y le pasa el mensaje por la entrada estándar. No hay red, servidor ni telemetría.
- **Qué:** las cookies de los dominios de la lista, con los campos de `chrome.cookies.Cookie` (`domain`, `hostOnly`, `path`, `secure`, `httpOnly`, `session`, `expirationDate`, `name`, `value`), el nombre del navegador y la versión de la extensión.
- **Cuándo:** 3 s después de que cambie una cookie de la lista, cada 30 min como sincronización completa, y al pulsar **Enviar ahora**. Solo se envía si el contenido cambió (se compara un hash SHA-256).
- **Qué hace ymd:** escribe `cookies.txt` (formato Netscape) en su carpeta de datos, cifrado con una clave del llavero del sistema y con permisos solo para tu usuario, y lo usa con yt-dlp.

El protocolo completo está en [Protocolo del puente de cookies](/ymd/desarrollo/puente-de-cookies/).

## Privacidad

- La extensión guarda la lista de sitios, el estado (última sincronización, número de cookies, dominios y el último error) y el hash. Nunca guarda el valor de una cookie.
- Las cookies se envían solo a ymd en este equipo. No se envían por red ni al desarrollador.
- Ninguna otra extensión ni página web puede comunicarse con «ymd Cookies», y ymd nunca devuelve cookies a nadie. Detalles en [Seguridad](/ymd/desarrollo/puente-de-cookies/#seguridad).
- Para dejar de compartir: quita el sitio de la lista o desinstala la extensión. **Borrar copia**, en **Ajustes → Cuentas**, borra el `cookies.txt` de ymd.

## Solución de problemas

**El sello dice «Sin conexión»: «ymd no está instalado o no registró el puente».**
Abre ymd una vez: registra el puente al arrancar. Comprueba que la tarjeta en **Ajustes → Cuentas** no diga **Sin puente**. Después pulsa **Enviar ahora**.

**«ymd no reconoce esta extensión».**
La extensión cargada no tiene el ID de ymd. Quítala y cárgala desde la carpeta que indica ymd en **Ajustes → Cuentas**.

**«ymd se cerró antes de responder» o «ymd no pudo guardar las cookies».**
Vuelve a intentarlo con **Enviar ahora**. Si el error se repite, actualiza ymd.

**La tarjeta sigue en «Pendiente».**
La primera sincronización llega cuando cambia una cookie o al pulsar **Enviar ahora** en la extensión. Comprueba que iniciaste sesión en YouTube en ese navegador.

**Brave avisa de extensiones en modo desarrollador al iniciar.**
Brave muestra este aviso con cualquier extensión cargada en modo desarrollador; no indica un problema.

**«Hay una versión nueva de la extensión».**
ymd incluye una versión de la extensión más reciente que la que tienes cargada. En la página de extensiones del navegador, pulsa el botón de recargar de **ymd Cookies**.
