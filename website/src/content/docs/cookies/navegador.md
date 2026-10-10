---
title: Cookies del navegador
description: Que yt-dlp lea las cookies directamente del navegador, y por qué en Windows conviene Firefox.
---

Con **Origen de las cookies → Navegador**, yt-dlp lee las cookies del navegador en cada descarga (`--cookies-from-browser`).

## Elegir navegador y perfil

En **Ajustes → Cuentas → Cookies del navegador**:

1. Elige el **Navegador**. ymd detecta los instalados (**Volver a detectar** repite la búsqueda) y marca los que están abiertos.
2. Elige el **Perfil** si el navegador tiene varios. Brave tiene soporte de primera clase: los perfiles se leen de su configuración.
3. Pulsa **Probar cookies**. Si funcionan, se usan en las próximas descargas.

**Importar desde el navegador ahora** guarda una copia en el `cookies.txt` de ymd. Elige luego **Archivo cookies.txt** como origen para usarla con el navegador abierto.

## Windows: Firefox recomendado

En Windows, Firefox es el único navegador cuyas cookies yt-dlp puede leer directamente. Brave, Chrome y Edge las cifran con cifrado ligado a la aplicación (_app-bound encryption_): solo el propio navegador puede descifrarlas, así que ningún otro programa, tampoco yt-dlp, las abre. Además mantienen bloqueada la base de cookies mientras están abiertos.

Por eso la lista marca Firefox como **recomendado en Windows**. Inicia sesión en YouTube en Firefox y elígelo como navegador. Si no lo tienes, **Descargar Firefox** abre su página.

Si usas Brave, Chrome o Edge en Windows, tienes dos alternativas:

- La [extensión ymd Cookies](/ymd/cookies/extension/), que envía las cookies desde dentro del navegador.
- Un [archivo cookies.txt](/ymd/cookies/cookies-txt/) exportado a mano.

En macOS y Linux, yt-dlp puede leer las cookies de los navegadores Chromium y de Firefox (y Safari en macOS).

## Errores frecuentes

- **El navegador tiene bloqueadas sus cookies**: ciérralo por completo, incluido el icono junto al reloj, y pulsa **Ya cerré Brave, probar otra vez** (con el nombre de tu navegador). O usa un `cookies.txt`, que funciona con el navegador abierto.
- **No se pudieron leer las cookies del navegador**: es el cifrado de Windows descrito arriba. Usa la extensión de ymd, Firefox o un `cookies.txt`.

Más en [Solución de problemas](/ymd/solucion-de-problemas/).
