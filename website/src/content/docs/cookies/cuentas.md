---
title: Cuentas por sitio
description: Usuario y contraseña para sitios que los admiten en yt-dlp, guardados en el llavero del sistema.
---

Algunos sitios, como Vimeo, aceptan usuario y contraseña en yt-dlp. ymd los guarda en **Ajustes → Cuentas → Cuentas de sitios**.

## Agregar una cuenta

1. En **Sitio**, busca el sitio por su nombre (por ejemplo «Vimeo, Udemy, Twitch…»). Solo aparecen los que admiten cuenta en yt-dlp.
2. Escribe **Usuario** y **Contraseña**.
3. Pulsa **Guardar cuenta**.

Si el sitio no aparece, **Otro (avanzado)** permite escribir manualmente la **Clave del sitio**: la clave netrc de yt-dlp, por ejemplo `vimeo`. Solo admite minúsculas, números, punto, guion y guion bajo, sin empezar por guion ni guion bajo.

YouTube no acepta usuario y contraseña. Para YouTube usa las [cookies](/ymd/cookies/por-que/).

## Cómo se guardan

- La contraseña va al llavero del sistema: Administrador de credenciales en Windows, Llavero en macOS y Secret Service en Linux. ymd nunca la vuelve a mostrar.
- ymd solo guarda en disco un índice de sitio y usuario, sin contraseñas, para listar las cuentas.
- Al descargar, ymd entrega la cuenta a yt-dlp directamente desde el llavero: la contraseña no pasa por el disco ni por los argumentos de ningún proceso. Detalles técnicos en [Arquitectura](/ymd/desarrollo/arquitectura/).

## Sitios compatibles

**Sitios compatibles** muestra la lista oficial de extractores de yt-dlp, el motor de descargas de ymd (más de 1.700), incluida en ymd y actualizada con cada versión. Se puede buscar por nombre o descripción y filtrar por **Admite cuenta** o **Roto** (según yt-dlp).

**¿Cómo agrego más?** resume las opciones:

- **El sitio pide cuenta**: elígelo en **Cuentas de sitios** y guarda tu usuario y contraseña.
- **El sitio no admite cuenta o exige iniciar sesión en el navegador**: usa las cookies.
- **El sitio no está en la lista**: pega el enlace de todos modos; el extractor genérico de yt-dlp admite muchas páginas. Si no funciona, puedes solicitar soporte en los [issues de yt-dlp](https://github.com/yt-dlp/yt-dlp/issues).
