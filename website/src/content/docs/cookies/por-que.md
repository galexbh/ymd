---
title: Por qué hacen falta
description: Cuándo necesita ymd tu sesión, y qué opciones hay.
---

Algunos videos solo se descargan con una sesión iniciada:

- YouTube pide a veces confirmar que no eres un bot.
- Videos con restricción de edad, privados a los que tu cuenta tiene acceso, o solo para miembros.
- Sitios que exigen iniciar sesión, como Vimeo o Udemy.

yt-dlp no tiene tu sesión por sí mismo. ymd se la puede dar de varias formas, todas opcionales y configuradas en **Ajustes → Cuentas**:

| Opción                                           | Para qué                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| [Extensión ymd Cookies](/ymd/cookies/extension/) | Brave, Chrome, Edge y otros navegadores Chromium. Envía las cookies a ymd cuando cambian.        |
| [Cookies de Firefox](/ymd/cookies/navegador/)    | ymd lee las cookies de Firefox directamente (y de Safari en macOS).                              |
| [Archivo cookies.txt](/ymd/cookies/cookies-txt/) | Una copia exportada a mano. Funciona con cualquier navegador.                                    |
| [Cuentas por sitio](/ymd/cookies/cuentas/)       | Usuario y contraseña para sitios que los admiten en yt-dlp, guardados en el llavero del sistema. |

## Origen de las cookies

En **Ajustes → Cuentas → Cookies del navegador**, **Origen de las cookies** tiene cuatro valores:

- **Ninguno**: descarga sin sesión iniciada.
- **Extensión**: para Brave, Chrome, Edge y otros navegadores Chromium. La extensión de ymd envía tus cookies cada vez que cambian.
- **Firefox**: ymd lee las cookies de Firefox en cada descarga, aunque esté abierto. En macOS se llama **Firefox o Safari**.
- **Archivo cookies.txt**: ymd usa un archivo cookies.txt que exportas tú. Sirve con cualquier navegador.

La extensión y el archivo importado escriben en la misma copia de cookies de ymd.

## Privacidad

- Las contraseñas de sitios viven solo en el llavero del sistema; nunca en disco ni en los argumentos de procesos.
- La copia de cookies de ymd se guarda en su carpeta de datos, con permisos solo para tu usuario, y se borra con **Borrar copia**.
- yt-dlp recibe una copia temporal de las cookies en cada ejecución.
- La contraseña de un video y el código 2FA de una descarga se usan en esa descarga y no se guardan.
