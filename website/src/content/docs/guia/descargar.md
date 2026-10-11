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

Para videos protegidos, **Opciones de esta descarga** acepta una **Contraseña del video** y un **Código de verificación (2FA)**. No se guardan: solo se usan en esa descarga.

## Preajustes

Un preajuste fija el formato, la calidad y lo que se incrusta. ymd trae seis:

| Preajuste      | Tipo  | Resultado                                                          |
| -------------- | ----- | ------------------------------------------------------------------ |
| Mejor calidad  | Video | La mejor calidad disponible                                        |
| MP4 1080p      | Video | MP4 hasta 1080p                                                    |
| MP4 720p       | Video | MP4 hasta 720p                                                     |
| MP3 320 kbps   | Audio | Extracción a MP3                                                   |
| M4A (AAC)      | Audio | AAC en contenedor m4a; con YouTube suele guardarse sin recodificar |
| Audio original | Audio | El audio tal como lo entrega el sitio (m4a u opus), sin convertir  |

En **Ajustes → Preajustes** puedes crear los tuyos (**Nuevo preajuste**) o duplicar uno incluido. Cada preajuste define:

- **Altura máxima** y **Contenedor** (MP4, MKV, WebM o el que venga, sin recodificar) para video.
- **Formato de audio** (MP3, M4A, Opus, FLAC u original) y **Calidad** para audio.
- **Incrustar miniatura**, **Incrustar metadatos** e **Incrustar subtítulos**, con sus **Idiomas de subtítulos** (por ejemplo `es,en`).
- **Quitar segmentos con SponsorBlock**, eligiendo las categorías (patrocinio, intro, cierre, autopromoción…).
- **Ajustes del audio**, solo en preajustes de audio (ver abajo).
- **Carpeta del preajuste**: vacía usa la carpeta general de videos o de música.

En un preajuste incluido solo se pueden cambiar las opciones de incrustación, los ajustes del audio y la carpeta; el formato se actualiza con ymd. **Usar como preajuste predeterminado** lo deja elegido en el mostrador.

### Ajustes del audio

Tres opciones para dejar ordenada una biblioteca de música. Vienen apagadas y se aplican al terminar la descarga:

- **Separar artista y título**: si el título del video tiene la forma «Artista - Canción» (con guion, guion medio o raya entre espacios), guarda «Artista» en la etiqueta de artista y «Canción» en la de título. Los títulos con otra forma quedan como están. El nombre del archivo no cambia. Requiere **Incrustar metadatos**.
- **Carátula cuadrada**: recorta la miniatura por el centro al lado más corto, de modo que una imagen 16:9 de 1280×720 queda en 720×720. Requiere **Incrustar miniatura**.
- **Igualar volumen**: normaliza el volumen a -14 LUFS (EBU R128) para que todas las canciones suenen parejo. El audio se vuelve a codificar con la calidad del preajuste y queda a 48 kHz.

**Igualar volumen** no está disponible con el formato **Original (sin convertir)**, porque ese formato guarda el audio tal como llega, sin codificarlo de nuevo. Tampoco se aplica cuando el sitio ya entrega un archivo con el mismo formato elegido (por ejemplo, un `.m4a` para **M4A**): yt-dlp no lo convierte y el volumen queda igual.

## Playlists

Cuando el enlace es una lista, la ficha muestra una cuadrícula de miniaturas con todas las entradas:

- **Todas** o **Ninguna** marcan o desmarcan la lista entera.
- **Del** … **al** y **Seleccionar rango** marcan un tramo.
- <kbd>Mayús</kbd> + clic marca todas las entradas entre dos clics.

Cada entrada elegida entra al registro como una descarga propia («Entrada 3 de 12»).

## Descargar solo un tramo

La ficha de un video (no la de una lista) incluye el bloque **Tramo**, con dos campos: **Desde** y **Hasta**. Acepta segundos (`90`), `m:ss` (`1:30`) o `h:mm:ss` (`1:02:03`):

- Con los dos campos vacíos se descarga el video completo.
- **Desde** vacío empieza en `0:00`; **Hasta** vacío llega hasta el final del video.
- Si la hora no tiene un formato válido, **Hasta** no va después de **Desde** o el tramo pasa del final del video, el campo lo indica e **Ingresar** queda desactivado hasta corregirlo.

El archivo lleva el tramo al final del nombre, con puntos en lugar de dos puntos para que sea válido en cualquier sistema: `Mi video [abc123] [1.30-2.45].mp4`. En el registro, la fila muestra el tramo junto al título («1:30–2:45»).

Para que el archivo empiece y termine justo donde se pidió, ffmpeg vuelve a codificar el video alrededor de los cortes, así que tarda más que una descarga completa del mismo tamaño. Mientras se descarga el tramo, el avance no muestra porcentaje. aria2c no se usa en estas descargas aunque esté activado.

El tramo no está disponible para listas ni en el panel **Varios enlaces**. Una descarga sin terminar conserva su tramo al reanudarla.

## Varios enlaces a la vez

Si pegas en el campo **Enlace** un texto con dos o más enlaces (uno por línea o separados por espacios), el campo no cambia y aparece el panel **Varios enlaces**:

- El título dice cuántos enlaces se encolarán («3 enlaces») y la lista los muestra en el orden en que los pegaste. Los repetidos se cuentan una sola vez.
- Lo que no es un enlace descargable aparece tachado y marcado **Excluido**, con una nota que dice cuántos se dejan fuera. Caben hasta 200 enlaces por vez; los que sobran también se avisan.
- Todos usan el **Video** o **Audio** y el **Preajuste** elegidos en el mostrador, y van al mismo **Estante**. Con **Preguntar la carpeta en cada descarga**, la carpeta se pregunta una sola vez para todos.
- **Playlists completas**: apagado, un enlace de lista descarga solo el video enlazado; encendido, cada enlace de lista descarga la lista entera.
- **Encolar 3** (o <kbd>Enter</kbd>) los pasa todos a la cola; **Cancelar** (o <kbd>Esc</kbd>) los descarta. Un aviso resume cuántos entraron.

Los enlaces del panel no se revisan antes de encolarlos: el título y la miniatura de cada uno aparecen en el registro cuando yt-dlp empieza a descargarlo. Si pegas un solo enlace, el mostrador funciona como siempre.

## La cola

Varias descargas avanzan a la vez. El número se cambia en **Ajustes → Descargas → Descargas a la vez** (entre 1 y 8); más descargas a la vez reparten la misma conexión. En la misma sección:

- **Carpetas**: carpeta de videos, carpeta de música y **Preguntar la carpeta en cada descarga**.
- **Nombre de archivo**: la **Plantilla** usa los campos de yt-dlp, como `%(title)s`, `%(id)s`, `%(uploader)s` o `%(ext)s`. Debe incluir `%(ext)s`.
- **Saltar lo ya descargado**: yt-dlp anota cada video en un archivo de registro y no lo repite.
- **Usar aria2c**: descarga cada archivo por varias conexiones (requiere instalar aria2c en Dependencias).
- **Límite de velocidad**: **Sin límite** (lo predeterminado), 1, 2, 5, 10, 20 o 50 MB/s, u **Otro…** para escribir un número entero entre 1 y 1000. Cada descarga respeta ese tope por separado, y con aria2c también se aplica a aria2c. El límite se aplica a las descargas que empiecen después de guardarlo; las que ya están en curso mantienen la velocidad con la que empezaron.
- **Avisar cuando termine una descarga**: ver [Avisos](#avisos).

### Programar el inicio

Para dejar descargas en cola y que empiecen más tarde (por ejemplo, durante la noche), escribe una hora en la pantalla **Registro**, junto a **Programar inicio**, y pulsa el botón. Si esa hora ya pasó hoy, la cola empieza mañana a esa hora.

Mientras tanto, un aviso dice «La cola empieza a las 23:30» (o «mañana a las …»): lo que esté en cola espera y lo que ya se descarga sigue. **Empezar ahora** quita la hora programada e inicia la cola de inmediato. La hora programada se descarta al salir de ymd.

## Avisos

Mientras ymd está en segundo plano (otra ventana delante, minimizado o en la bandeja), una notificación del sistema avisa cuando termina una descarga:

- Si se archivó, la notificación dice **Descarga terminada** y el título del video.
- Si falló, dice **No se pudo descargar «…»** y el motivo. Al volver a ymd se abre el **Registro**, donde la fila explica qué hacer.
- Varias descargas que terminan casi a la vez llegan en una sola notificación («3 descargas terminadas»; si alguna falló, también lo dice).

Con la ventana de ymd en primer plano no hay notificación del sistema; el aviso se muestra dentro de la app. Para no recibirlas, apaga **Ajustes → Descargas → Avisar cuando termine una descarga**.

## Al cerrar la ventana

Al pulsar la X, ymd no se cierra: se oculta en la bandeja del sistema, junto al reloj (en macOS, en la barra de menús). Las descargas siguen y responde al instante a **Descargar con ymd** desde el navegador. La primera vez lo avisa con una notificación.

- Clic en el icono o **Abrir ymd** en su menú: vuelve la ventana.
- **Salir** en su menú: cierra ymd por completo. Las descargas a medias se detienen, pero no se pierden: ver [Descargas sin terminar](#descargas-sin-terminar).

Para que la X cierre ymd, apaga **Ajustes → Avanzado → Al cerrar la ventana → Mantener ymd en la bandeja del sistema** (en macOS, **Mantener ymd en la barra de menús**). En los escritorios Linux sin bandeja del sistema, la X cierra ymd siempre.

## Descargas sin terminar

Si ymd se cierra con descargas en curso o en cola (con **Salir**, al apagar el equipo o por un cierre inesperado), las recuerda. La próxima vez, el **Registro** muestra «Hay N descargas sin terminar» con su número y título:

- **Reanudar** las vuelve a poner en la cola con el mismo número. yt-dlp sigue desde donde iba, sin bajar de nuevo lo que ya tenía.
- **Descartar** las quita de la lista y borra sus archivos parciales.

Las descargas no se reanudan automáticamente. Las que usaron una **Contraseña del video** o un **Código de verificación (2FA)** aparecen aparte, porque ymd nunca guarda esos datos: vuelve a pegar su enlace en **Recibir** y escribe esos datos otra vez.

Una descarga sin terminar que nadie reanuda en 14 días se olvida al abrir ymd, junto con sus archivos parciales.

## El registro

La pantalla **Registro** lista todas las descargas de la sesión, de la más reciente a la más antigua, con su número (**N.º**), título, formato, tamaño, avance exacto en bytes, velocidad, tiempo restante y estado. Se puede filtrar por estado (**En curso**, **En cola**, **Archivadas**, **Fallidas**) y **Limpiar terminados**. La pantalla **Recibir** muestra el registro de la sesión debajo del mostrador.

Cada fila tiene sus acciones: **Cancelar**, **Reintentar**, **Abrir archivo**, **Mostrar en la carpeta** y **Quitar del registro**.

- **Reintentar** no sirve para una descarga que usó una **Contraseña del video** o un **Código de verificación (2FA)**: ymd olvida esos datos en cuanto la descarga termina. Vuelve a pegar el enlace en **Recibir** y escríbelos otra vez.
- ymd puede quedarse días en la bandeja del sistema: el registro guarda las 200 descargas terminadas más recientes y quita solas las más antiguas. Las que están en curso o en cola nunca se quitan.

## Los sellos

El estado de cada ingreso aparece como un sello:

| Sello       | Significado                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| En cola     | Espera su turno.                                                                                                    |
| Descargando | yt-dlp está bajando el archivo.                                                                                     |
| Uniendo     | ffmpeg une las pistas de video y audio.                                                                             |
| Procesando  | Post-proceso: miniatura, metadatos, subtítulos, SponsorBlock o conversión.                                          |
| Archivado   | Terminado. El archivo queda anotado en el [Catálogo](/ymd/guia/catalogo/).                                          |
| Fallido     | La descarga no se completó. El mensaje explica qué hacer; ver [Solución de problemas](/ymd/solucion-de-problemas/). |
| Anulado     | Cancelado por ti.                                                                                                   |

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
