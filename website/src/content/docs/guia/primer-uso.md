---
title: Primer uso
description: La pantalla de inicio instala las herramientas y elige dónde se archivan las descargas.
---

La primera vez que abres ymd aparece la pantalla **Antes del primer ingreso**. Tiene tres partes.

## Herramientas

ymd descarga con [yt-dlp](https://github.com/yt-dlp/yt-dlp) y une video y audio con [FFmpeg](https://ffmpeg.org/). Pulsa **Instalar lo necesario** para que ymd los descargue, verificados, en tu carpeta de usuario. Si tu equipo no tiene un entorno JavaScript, también instala [Deno](https://deno.com/), que YouTube exige para entregar los formatos.

Si la instalación no termina, suele ser la conexión o un límite temporal de GitHub. Lo que ya se instaló se conserva; reintenta en un momento. Puedes revisar, actualizar o quitar las herramientas cuando quieras en [Dependencias](/ymd/dependencias/).

## Dónde se archiva

Los videos y la música van a carpetas distintas (**Videos** y **Música**). Pulsa **Cambiar** para elegir otras. Cada preajuste puede tener además su propia carpeta (ver [Descargar video y audio](/ymd/guia/descargar/#preajustes)).

## Cuentas (opcional)

Si YouTube te pide confirmar que no eres un bot, ymd puede usar las cookies de tu navegador. **Configurar cookies** abre **Ajustes → Cuentas**. Puedes hacerlo más tarde; ver [Cookies y cuentas](/ymd/cookies/por-que/).

## Terminar

Pulsa **Empezar a recibir** para ir al mostrador de la pantalla **Recibir**, o **Omitir por ahora**. Sin yt-dlp y ffmpeg no se puede descargar; puedes instalarlos luego en **Dependencias**.
