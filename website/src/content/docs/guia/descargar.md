---
title: Descargar video y audio
description: El mostrador de Recibir, los preajustes, las playlists, la cola y el registro.
---

ymd trata cada descarga como un ingreso de archivo: recibe un número, avanza en el registro y, al terminar, se sella como **Archivado** con su fecha.

## El mostrador

La pantalla **Recibir** tiene un mostrador de ingreso:

1. Pega un enlace en el campo **Enlace** (YouTube o cualquier sitio compatible con yt-dlp). Con el mostrador vacío, <kbd>Ctrl</kbd>+<kbd>V</kbd> pega y revisa el enlace desde cualquier parte de la pantalla.
2. ymd revisa el enlace y muestra su ficha: título, duración, sitio y, en una lista, el número de entradas. La ficha indica también el preajuste y el estante (la carpeta) donde se archivará.
3. Elige **Video** o **Audio** y un **Preajuste**.
4. Pulsa **Ingresar** (o <kbd>Enter</kbd>).

Para videos protegidos, **Opciones de esta descarga** acepta una **Contraseña del video** y un **Código de verificación (2FA)**. No se guardan: se usan en esa descarga y se olvidan.

## Preajustes

Un preajuste fija el formato, la calidad y lo que se incrusta. ymd trae cinco:

| Preajuste      | Tipo  | Resultado                                                         |
| -------------- | ----- | ----------------------------------------------------------------- |
| Mejor calidad  | Video | La mejor calidad disponible                                       |
| MP4 1080p      | Video | MP4 hasta 1080p                                                   |
| MP4 720p       | Video | MP4 hasta 720p                                                    |
| MP3 320 kbps   | Audio | Extracción a MP3                                                  |
| Audio original | Audio | El audio tal como lo entrega el sitio (m4a u opus), sin convertir |

En **Ajustes → Preajustes** puedes crear los tuyos (**Nuevo preajuste**) o duplicar uno incluido. Cada preajuste define:

- **Altura máxima** y **Contenedor** (MP4, MKV, WebM o el que venga, sin recodificar) para video.
- **Formato de audio** (MP3, M4A, Opus, FLAC u original) y **Calidad** para audio.
- **Incrustar miniatura**, **Incrustar metadatos** e **Incrustar subtítulos**, con sus **Idiomas de subtítulos** (por ejemplo `es,en`).
- **Quitar segmentos con SponsorBlock**, eligiendo las categorías (patrocinio, intro, cierre, autopromoción…).
- **Carpeta del preajuste**: vacía usa la carpeta general de videos o de música.

En un preajuste incluido solo cambian lo que se incrusta y la carpeta; el formato se mantiene al día con ymd. **Usar como preajuste predeterminado** lo deja elegido en el mostrador.

## Playlists

Cuando el enlace es una lista, la ficha muestra una cuadrícula de miniaturas con todas las entradas:

- **Todas** o **Ninguna** marcan o desmarcan la lista entera.
- **Del** … **al** y **Seleccionar rango** marcan un tramo.
- <kbd>Mayús</kbd> + clic marca todas las entradas entre dos clics.

Cada entrada elegida entra al registro como una descarga propia («Entrada 3 de 12»).

## La cola

Varias descargas avanzan a la vez. El número se cambia en **Ajustes → Descargas → Descargas a la vez** (entre 1 y 8); más descargas a la vez reparten la misma conexión. En la misma sección:

- **Carpetas**: carpeta de videos, carpeta de música y **Preguntar la carpeta en cada descarga**.
- **Nombre de archivo**: la **Plantilla** usa los campos de yt-dlp, como `%(title)s`, `%(id)s`, `%(uploader)s` o `%(ext)s`. Debe incluir `%(ext)s`.
- **Saltar lo ya descargado**: yt-dlp anota cada video en un archivo de registro y no lo repite.
- **Usar aria2c**: descarga cada archivo por varias conexiones (requiere instalar aria2c en Dependencias).

## El registro

La pantalla **Registro** lista todas las descargas de la sesión, de la más reciente a la más antigua, con su número (**N.º**), título, formato, tamaño, avance exacto en bytes, velocidad, tiempo restante y estado. Se puede filtrar por estado (**En curso**, **En cola**, **Archivadas**, **Fallidas**) y **Limpiar terminados**. La pantalla **Recibir** muestra el registro de la sesión debajo del mostrador.

Cada fila tiene sus acciones: **Cancelar**, **Reintentar**, **Abrir archivo**, **Mostrar en la carpeta** y **Quitar del registro**.

## Los sellos

El estado de cada ingreso aparece como un sello:

| Sello       | Significado                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------------- |
| En cola     | Espera su turno.                                                                                    |
| Descargando | yt-dlp está bajando el archivo.                                                                     |
| Uniendo     | ffmpeg une las pistas de video y audio.                                                             |
| Procesando  | Post-proceso: miniatura, metadatos, subtítulos, SponsorBlock o conversión.                          |
| Archivado   | Terminado. El archivo queda anotado en el [Catálogo](/ymd/guia/catalogo/).                          |
| Fallido     | Algo falló. El mensaje explica qué hacer; ver [Solución de problemas](/ymd/solucion-de-problemas/). |
| Anulado     | Cancelado por ti.                                                                                   |

Una descarga fallida muestra el motivo y un botón con el arreglo directo. **Mostrar el detalle del error** despliega la última línea de yt-dlp, útil para reportar un problema.

## Atajos de teclado

<kbd>Ctrl</kbd> en Windows y Linux; <kbd>Cmd</kbd> en macOS.

| Atajo                                     | Acción                                               |
| ----------------------------------------- | ---------------------------------------------------- |
| <kbd>Ctrl</kbd>+<kbd>L</kbd>              | Ir al campo del enlace                               |
| <kbd>Ctrl</kbd>+<kbd>V</kbd>              | Pegar un enlace y revisarlo (con el mostrador vacío) |
| <kbd>Enter</kbd>                          | Ingresar el enlace revisado                          |
| <kbd>Ctrl</kbd>+<kbd>1</kbd>–<kbd>5</kbd> | Cambiar de sección                                   |
| <kbd>Ctrl</kbd>+<kbd>,</kbd>              | Abrir Ajustes                                        |
| <kbd>?</kbd>                              | Mostrar la lista de atajos                           |
