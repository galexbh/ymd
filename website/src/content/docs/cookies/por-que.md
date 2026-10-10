---
title: Por qué hacen falta
description: Cuándo necesita ymd tu sesión, y qué opciones hay.
---

Algunos videos solo se descargan con una sesión iniciada:

- YouTube pide a veces confirmar que no eres un bot.
- Videos con restricción de edad, privados a los que tu cuenta tiene acceso, o solo para miembros.
- Sitios que exigen iniciar sesión, como Vimeo o Udemy.

yt-dlp no tiene tu sesión por sí mismo. ymd se la puede dar de varias formas, todas opcionales y configuradas en **Ajustes → Cuentas**:

| Opción                                           | Para qué                                                                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| [Extensión ymd Cookies](/ymd/cookies/extension/) | Brave, Chrome y Edge. Envía las cookies a ymd cuando cambian. Recomendada en Windows para navegadores Chromium. |
| [Cookies del navegador](/ymd/cookies/navegador/) | yt-dlp lee las cookies directamente. Firefox en Windows; cualquier navegador compatible en macOS y Linux.       |
| [Archivo cookies.txt](/ymd/cookies/cookies-txt/) | Una copia exportada a mano. Funciona con cualquier navegador.                                                   |
| [Cuentas por sitio](/ymd/cookies/cuentas/)       | Usuario y contraseña para sitios que los admiten en yt-dlp, guardados en el llavero del sistema.                |

## Origen de las cookies

En **Ajustes → Cuentas → Cookies del navegador**, **Origen de las cookies** tiene tres valores:

- **Ninguno**: yt-dlp descarga sin sesión iniciada.
- **Navegador**: yt-dlp lee las cookies del navegador en cada descarga.
- **Archivo cookies.txt**: yt-dlp usa la copia importada; funciona aunque el navegador esté abierto. La extensión escribe en esta misma copia.

## Privacidad

- Las contraseñas de sitios viven solo en el llavero del sistema; nunca en disco ni en los argumentos de procesos.
- La copia de cookies de ymd se guarda en su carpeta de datos, con permisos solo para tu usuario, y se borra con **Borrar copia**.
- yt-dlp recibe una copia temporal de las cookies en cada ejecución.
- La contraseña de un video y el código 2FA de una descarga se usan en esa descarga y no se guardan.
