---
title: Dependencias
description: Las herramientas que ymd instala, dónde viven y cómo se verifican.
---

ymd instala las herramientas que necesita en tu carpeta de usuario, comprueba su firma cuando el autor la publica y las mantiene al día. No instala nada a nivel de sistema. La pantalla **Dependencias** muestra cada herramienta con su nivel, estado (**Instalado**, **Del sistema**, **Falta**), versión y verificación.

## Herramientas

| Herramienta                                           | Nivel       | Uso                                                             | Origen                                                                                                                                                  |
| ----------------------------------------------------- | ----------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp)            | requerida   | El motor de descargas.                                          | Ejecutable oficial del canal elegido (estable, nightly o master), verificado con `SHA2-256SUMS`.                                                        |
| [FFmpeg](https://ffmpeg.org/) (ffmpeg y ffprobe)      | requerida   | Une video y audio y convierte formatos.                         | [yt-dlp/FFmpeg-Builds](https://github.com/yt-dlp/FFmpeg-Builds) en Windows y Linux, verificado con `checksums.sha256`. En macOS: `brew install ffmpeg`. |
| [Deno](https://deno.com/)                             | recomendada | Entorno JavaScript que YouTube exige para obtener los formatos. | [denoland/deno](https://github.com/denoland/deno), verificado con su archivo `.sha256sum`.                                                              |
| [aria2c](https://aria2.github.io/)                    | opcional    | Descargas por varias conexiones a la vez.                       | Windows: [aria2/aria2](https://github.com/aria2/aria2) (sin suma publicada). macOS: `brew install aria2`. Linux: `sudo apt install aria2`.              |
| [AtomicParsley](https://github.com/wez/atomicparsley) | opcional    | Incrusta portadas en archivos MP4 y M4A.                        | [wez/atomicparsley](https://github.com/wez/atomicparsley) (sin suma publicada) en Windows, macOS Apple Silicon y Linux x64; si no, con Homebrew o apt.  |

Cuando no hay una compilación descargable para tu sistema, la pantalla muestra el comando del gestor de paquetes en su lugar.

Acciones: **Instalar todo lo recomendado**, **Buscar actualizaciones**, y por herramienta **Instalar**, **Actualizar** o **Quitar**. Si una instalación falla, la copia anterior, si existía, sigue intacta.

## Carpeta de herramientas

| Sistema | Ubicación predeterminada                                           |
| ------- | ------------------------------------------------------------------ |
| Windows | `%LOCALAPPDATA%\ymd\bin`                                           |
| macOS   | `~/Library/Application Support/<id de la app>/bin`                 |
| Linux   | `$XDG_DATA_HOME/<id de la app>/bin` (normalmente `~/.local/share`) |

Los programas viven aquí, fuera de la instalación de ymd; borrarlos no afecta tus descargas. La ubicación se cambia en **Ajustes → Avanzado → Carpeta de herramientas** (**Volver a la predeterminada** la restablece). **Abrir carpeta de datos** abre la carpeta donde ymd guarda su historial y su copia de cookies.

## Verificación

Cada descarga se comprueba con la suma SHA-256 que publica el autor antes de reemplazar la copia instalada. La columna **Verificación** indica **verificado SHA-256** o **sin verificación** (aria2c y AtomicParsley no publican sumas). El reemplazo es atómico: una actualización a medias no deja una herramienta rota.

## Copias del sistema

Si una herramienta ya está instalada en el sistema (en el `PATH`), aparece como **Del sistema** y se usa. Si el yt-dlp del sistema está desactualizado, ymd puede **Instalar copia actualizada**: la suya tendrá prioridad y el archivo del sistema no se toca.

## Entorno JavaScript

YouTube exige ejecutar JavaScript para entregar los formatos. yt-dlp usa el primero que encuentre, en este orden:

1. Deno instalado por ymd.
2. Deno, Node, Bun o QuickJS del sistema.

ymd solo pasa a yt-dlp versiones que yt-dlp admite: Deno 2.3.0 o posterior, Node 22 o posterior, Bun entre 1.2.11 y 1.3.14, QuickJS 2023-12-09 o posterior (QuickJS-NG, cualquiera). La sección **Entorno JavaScript** de Dependencias muestra cuál usará yt-dlp y cuáles más encontró. Si no hay ninguno, instala Deno con un clic.
