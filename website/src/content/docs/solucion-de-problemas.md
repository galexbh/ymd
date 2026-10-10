---
title: Solución de problemas
description: Qué significa cada error que muestra ymd y cómo resolverlo.
---

Cuando una descarga falla, ymd traduce el error de yt-dlp en un mensaje con su arreglo y un botón que lleva a él. Cada entrada de esta página usa el título que muestra la app, seguido del código interno del error (útil al reportar un problema). **Mostrar el detalle del error** despliega la última línea de yt-dlp.

## Sesión y acceso

### YouTube pide confirmar que no eres un bot

`bot_check`. YouTube bloqueó la petición hasta que confirmes que eres una persona, algo que exige una sesión iniciada.

**Arreglo:** activa las cookies de tu navegador en **Ajustes → Cuentas** y vuelve a intentarlo. El botón **Abrir Ajustes → Cuentas** lleva ahí. En Windows con Brave, Chrome o Edge, usa la [extensión ymd Cookies](/ymd/cookies/extension/); si no, [Firefox](/ymd/cookies/navegador/) o un [cookies.txt](/ymd/cookies/cookies-txt/).

### Video con restricción de edad

`age_restricted`. El video solo se muestra a cuentas que confirmaron ser mayores de edad.

**Arreglo:** inicia sesión en tu navegador con una cuenta mayor de edad y activa sus cookies en **Ajustes → Cuentas**.

### Este contenido requiere iniciar sesión

`login_required`. El sitio exige una sesión para este contenido.

**Arreglo:** activa las cookies de tu navegador o agrega tu cuenta del sitio en **Ajustes → Cuentas** (ver [Cuentas por sitio](/ymd/cookies/cuentas/)).

### El video es privado

`private`. El autor lo marcó como privado.

**Arreglo:** si tu cuenta tiene acceso, activa las cookies de tu navegador en **Ajustes → Cuentas** y reintenta.

### El video ya no está disponible

`unavailable`. El sitio dice que el video no existe o no se puede ver.

**Arreglo:** puede que lo hayan eliminado o bloqueado. Abre el enlace en tu navegador para confirmarlo.

### No disponible en tu país

`geoblocked`. El autor limitó el video por región.

**Arreglo:** prueba desde una conexión en una región permitida.

## Cookies del navegador

### El navegador tiene bloqueadas sus cookies

`cookies_locked`. El navegador está abierto y mantiene bloqueada su base de cookies, así que yt-dlp no puede leerla.

**Arreglo:** cierra el navegador por completo, incluido el icono junto al reloj, y pulsa **Ya cerré el navegador, reintentar** (aparece con su nombre). O pulsa **Usar un archivo cookies.txt**: una copia de las cookies funciona con el navegador abierto.

### No se pudieron leer las cookies del navegador

`cookies_decrypt`. yt-dlp encontró las cookies pero no pudo descifrarlas. En Windows, Brave, Chrome y Edge las cifran de forma que ningún otro programa puede leerlas (ver [Cookies del navegador](/ymd/cookies/navegador/#windows-firefox-recomendado)).

**Arreglo:** cierra el navegador y reintenta. Si sigue fallando, importa un archivo `cookies.txt` en **Ajustes → Cuentas**, usa la [extensión ymd Cookies](/ymd/cookies/extension/) o cambia a Firefox.

## Herramientas

### Falta ffmpeg

`ffmpeg_missing`. yt-dlp necesita ffmpeg para unir video y audio o para convertir el formato.

**Arreglo:** instálalo con un clic en **Dependencias** (botón **Instalar ffmpeg**). En macOS, instálalo con `brew install ffmpeg`.

### Falta el entorno JavaScript (Deno)

`js_runtime_missing`. YouTube exige ejecutar JavaScript para entregar los formatos, y no hay un entorno compatible.

**Arreglo:** instala Deno en **Dependencias** (botón **Instalar Deno**). Ver [Entorno JavaScript](/ymd/dependencias/#entorno-javascript).

### Falta una herramienta necesaria

`binary_missing`. No se encuentra yt-dlp u otra herramienta requerida.

**Arreglo:** abre **Dependencias** e instala lo que aparece como faltante (botón **Instalar lo que falta**).

## Enlace y red

### Este enlace no es compatible

`unsupported_url`. yt-dlp no reconoce la dirección.

**Arreglo:** comprueba que sea la dirección de un video o una lista. Si el sitio es nuevo, actualiza yt-dlp en **Dependencias** (botón **Revisar yt-dlp en Dependencias**). Ver también [Sitios compatibles](/ymd/cookies/cuentas/#sitios-compatibles).

### Se perdió la conexión

`network`. La conexión se cortó o el servidor no respondió.

**Arreglo:** revisa tu conexión a internet y vuelve a intentarlo.

## Disco y carpetas

### No queda espacio en el disco

`disk_full`. El disco de la carpeta de destino se llenó.

**Arreglo:** libera espacio o elige otra carpeta de destino en **Ajustes → Descargas** (botón **Cambiar carpeta en Ajustes**).

### No hay permiso para escribir en la carpeta

`permission_denied`. Tu usuario no puede escribir en la carpeta de destino.

**Arreglo:** elige otra carpeta de destino en **Ajustes → Descargas**.

## Otros

### La descarga falló por un motivo inesperado

`unknown`. yt-dlp falló con un error que ymd no reconoce.

**Arreglo:** reintenta. Si vuelve a fallar, actualiza yt-dlp en **Dependencias** y copia el detalle técnico si necesitas reportarlo. Los sitios cambian a menudo; el canal [Nightly](/ymd/guia/actualizaciones/#canal-de-actualización) suele traer el arreglo antes.

### Windows protegió su PC (SmartScreen)

Al instalar ymd en Windows, SmartScreen puede mostrar este aviso porque el instalador aún no tiene firma de código (Authenticode).

**Arreglo:** selecciona **Más información** y luego **Ejecutar de todas formas**. Ver [Instalación](/ymd/guia/instalacion/#aviso-de-smartscreen).
