---
title: Archivo cookies.txt
description: Importar una copia de cookies en formato Netscape.
---

Un archivo `cookies.txt` funciona con cualquier navegador y aunque esté abierto. Es la alternativa a la [extensión](/ymd/cookies/extension/) si prefieres no instalarla.

## Exportar

1. En tu navegador, instala una extensión de código abierto para exportar cookies, como «Get cookies.txt LOCALLY».
2. Abre una ventana privada y permite la extensión en ella.
3. Inicia sesión en YouTube (o en el sitio que necesites) dentro de esa ventana.
4. Usa la extensión para exportar las cookies en formato Netscape (`cookies.txt`) y cierra la ventana privada.

La ventana privada evita que la sesión de la copia se cruce con la de tu navegador habitual.

## Importar

En **Ajustes → Cuentas**, arrastra el archivo a **Suelta aquí tu cookies.txt** o pulsa **Elegir archivo…**. Al importarlo, el origen de las cookies cambia a **Archivo cookies.txt**.

Si falla con **No se pudo importar el archivo**, comprueba que sea un `cookies.txt` en formato Netscape.

## La copia de ymd

La sección **Copia de cookies de ymd** muestra su origen (archivo importado, navegador o extensión), la fecha, el número de cookies y los dominios.

La copia contiene tus sesiones abiertas. Se guarda solo en la carpeta de datos de ymd, con permisos solo para tu usuario, y se borra con **Borrar copia**. yt-dlp recibe una copia temporal en cada ejecución.
