---
title: Cookies de Firefox
description: Que ymd lea las cookies de Firefox (o Safari en macOS) directamente, y por qué los navegadores Chromium van por la extensión.
---

Con **Origen de las cookies → Firefox**, ymd lee las cookies de Firefox en cada descarga. En macOS la opción se llama **Firefox o Safari** y permite elegir cualquiera de los dos.

## Elegir perfil

En **Ajustes → Cuentas → Cookies del navegador**:

1. Elige **Firefox** como origen. ymd lo detecta (**Volver a detectar** repite la búsqueda). Si no lo tienes, **Descargar Firefox** abre su página.
2. Elige el **Perfil** si tienes varios.
3. Pulsa **Probar cookies**. Si funcionan, se usan en las próximas descargas.

Firefox puede estar abierto mientras descargas: ymd lee una copia de sus cookies.

## Navegadores Chromium

Brave, Chrome, Edge y los demás navegadores Chromium no se leen directamente; para ellos está la [extensión ymd Cookies](/ymd/cookies/extension/) (origen **Extensión**). Por dos motivos:

- En Windows cifran sus cookies con cifrado ligado a la aplicación (_app-bound encryption_): solo el propio navegador puede descifrarlas, así que ningún otro programa puede leerlas.
- Mantienen bloqueada la base de cookies mientras se ejecutan, y muchos siguen ejecutándose en segundo plano después de cerrar la última ventana (por ejemplo, el «Inicio rápido» de Edge).

La extensión resuelve ambos problemas: lee las cookies desde dentro del navegador y funciona con el navegador abierto, en Windows, macOS y Linux.

Más en [Solución de problemas](/ymd/solucion-de-problemas/).
