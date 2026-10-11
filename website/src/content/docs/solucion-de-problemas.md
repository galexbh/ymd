---
title: Solución de problemas
description: Qué significa cada error que muestra ymd y cómo resolverlo.
---

Cuando una descarga falla, ymd traduce el error de yt-dlp en un mensaje con su arreglo y un botón que lleva a él. Cada entrada de esta página usa el título que muestra la app, seguido del código interno del error (útil al reportar un problema). **Mostrar el detalle del error** despliega la última línea de yt-dlp.

## Sesión y acceso

### YouTube pide confirmar que no eres un bot

`bot_check`. YouTube bloqueó la petición hasta que confirmes que eres una persona, algo que exige una sesión iniciada.

**Arreglo:** activa las cookies de tu navegador en **Ajustes → Cuentas** y vuelve a intentarlo. El botón **Abrir Ajustes → Cuentas** lleva ahí. Con Brave, Chrome, Edge u otro navegador Chromium, usa la [extensión ymd Cookies](/ymd/cookies/extension/) en cualquier sistema; con Firefox (o Safari en macOS), ymd [lee las cookies directamente](/ymd/cookies/navegador/).

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

**Arreglo:** descarga desde una conexión ubicada en una región permitida.

## Cookies del navegador

### El navegador tiene bloqueadas sus cookies

`cookies_locked`. El navegador está abierto y mantiene bloqueada su base de cookies, así que yt-dlp no puede leerla.

**Arreglo:** ocurre con navegadores Chromium, que ymd no lee directamente. Elige **Extensión** como origen en **Ajustes → Cuentas** y usa la [extensión ymd Cookies](/ymd/cookies/extension/), que funciona con el navegador abierto.

### No se pudieron leer las cookies del navegador

`cookies_decrypt`. yt-dlp encontró las cookies pero no pudo descifrarlas. En Windows, Brave, Chrome y Edge las cifran de forma que ningún otro programa puede leerlas (ver [Navegadores Chromium](/ymd/cookies/navegador/#navegadores-chromium)).

**Arreglo:** elige **Extensión** como origen en **Ajustes → Cuentas** y usa la [extensión ymd Cookies](/ymd/cookies/extension/). Como alternativa, usa las [cookies de Firefox](/ymd/cookies/navegador/).

## Herramientas

### Falta ffmpeg

`ffmpeg_missing`. yt-dlp necesita ffmpeg para unir video y audio o para convertir el formato.

**Arreglo:** instálalo con un clic en **Dependencias** (botón **Instalar ffmpeg**). En macOS, instálalo con `brew install ffmpeg`.

### Falta el entorno JavaScript (Node.js)

`js_runtime_missing`. YouTube exige ejecutar JavaScript para entregar los formatos, y no hay un entorno compatible.

**Arreglo:** instala Node.js en **Dependencias** (botón **Instalar Node.js**). Ver [Entorno JavaScript](/ymd/dependencias/#entorno-javascript).

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

**Arreglo:** vuelve a intentarlo. Si falla de nuevo, actualiza yt-dlp en **Dependencias** y copia el detalle técnico si necesitas reportarlo. Los sitios cambian a menudo; el canal [Nightly](/ymd/guia/actualizaciones/#canal-de-actualización) suele traer el arreglo antes.

### Windows protegió su PC (SmartScreen)

Al instalar ymd en Windows, SmartScreen puede mostrar este aviso porque el instalador no tiene firma de código (Authenticode).

**Arreglo:** selecciona **Más información** y luego **Ejecutar de todas formas**. Ver [Instalación](/ymd/guia/instalacion/#aviso-de-smartscreen).

## Reportar un problema

### Registros de ymd

ymd anota lo que hace (cuánto tarda cada etapa de una descarga, cómo terminó, el código de error, las actualizaciones de herramientas y cuántas cookies llegaron de la extensión) en archivos de texto dentro de su carpeta de datos, en `logs`:

- **Windows:** `%APPDATA%\com.ymd.app\logs`
- **macOS:** `~/Library/Application Support/com.ymd.app/logs`
- **Linux:** `~/.local/share/com.ymd.app/logs`

**Ajustes → Avanzado → Abrir carpeta de datos** abre esa carpeta. Hay un archivo por día (`ymd.AAAA-MM-DD.jsonl`) y ymd borra automáticamente los que tienen más de 14 días (y los más antiguos si entre todos superan 20 MB).

Los registros nunca salen de tu equipo: ymd no tiene analíticas ni telemetría y no los envía a ningún lado. Tampoco guardan enlaces, contraseñas, códigos 2FA ni cookies; antes de escribir cada línea, ymd borra rutas de tu carpeta personal, parámetros de enlaces y cualquier cosa con forma de token.

### Exportar diagnóstico

Para reportar un problema en los [issues de ymd](https://github.com/galexbh/ymd/issues):

1. Abre **Ajustes → Avanzado** y pulsa **Exportar diagnóstico**.
2. Elige dónde guardar el archivo `ymd-diagnostico-AAAAMMDD-HHMM.zip`. Al terminar, el aviso **Diagnóstico guardado** trae **Mostrar en la carpeta**.
3. Adjunta ese zip al issue y cuenta qué hiciste y qué esperabas.

El zip se genera en tu equipo y solo se comparte si tú lo adjuntas. Contiene:

- `info.txt`: versión de ymd, sistema operativo y arquitectura, idioma, versiones de yt-dlp, FFmpeg y Node.js, el entorno JavaScript en uso y un resumen de tus ajustes (solo opciones y números, como el canal de yt-dlp o cuántas descargas simultáneas; ninguna carpeta).
- `logs/`: los registros de los últimos 14 días, limpiados otra vez al exportarlos.
- `timings.txt`: cuánto tardó cada etapa (descarga, unión, posprocesado) de las últimas descargas.

No contiene tu historial, el registro de descargas, cookies, contraseñas, datos del llavero del sistema ni tu archivo de ajustes.
