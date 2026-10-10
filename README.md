<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/ymd-logo-dark.svg">
  <img src="docs/assets/ymd-logo-light.svg" alt="ymd" width="220">
</picture>

<p><strong>Aplicación de escritorio para descargar video y audio con yt-dlp.</strong></p>

[![CI](https://github.com/galexbh/ymd/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/galexbh/ymd/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/galexbh/ymd?display_name=tag&sort=semver)](https://github.com/galexbh/ymd/releases/latest)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)
![Plataformas](https://img.shields.io/badge/plataformas-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Tauri 2](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)

[Descargar](https://github.com/galexbh/ymd/releases/latest) ·
[Changelog](CHANGELOG.md) ·
[Contribuir](CONTRIBUTING.md) ·
[English](README.en.md)

</div>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshot-receive-dark.png">
  <img src="docs/assets/screenshot-receive-light.png" alt="Pantalla Recibir de ymd con la ficha de un video y el registro de descargas">
</picture>

## Características

- **Video y audio:** MP4, MKV o WebM con calidad máxima configurable; extracción a MP3, M4A, Opus o FLAC.
- **Playlists:** completas o con selección de entradas.
- **Cola de descargas:** varias en paralelo, con progreso, velocidad y tiempo restante; cancelación y reintento.
- **Catálogo:** historial con búsqueda, acceso al archivo y a su carpeta.
- **Post-proceso:** miniatura, metadatos y subtítulos incrustados; SponsorBlock.
- **Preajustes** editables, con carpeta de destino propia.
- **Dependencias gestionadas:** instala y actualiza yt-dlp, ffmpeg y Deno en una carpeta del usuario, con verificación SHA-256.
- **Cookies y cuentas:** extensión propia para Brave, Chrome y Edge; cookies de Firefox; importación de `cookies.txt`; credenciales en el llavero del sistema.
- **Detección de enlaces** copiados al portapapeles, configurable.
- **Diagnóstico de errores** de yt-dlp con la acción para resolverlos.
- **Temas** claro y oscuro con color de acento, densidad y tamaño de texto configurables.
- **Actualizaciones automáticas** firmadas.
- Interfaz en **español e inglés**.

<table>
  <tr>
    <td width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshot-catalog-dark.png">
        <img src="docs/assets/screenshot-catalog-light.png" alt="Catálogo de descargas">
      </picture>
    </td>
    <td width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshot-appearance-dark.png">
        <img src="docs/assets/screenshot-appearance-light.png" alt="Ajustes de apariencia">
      </picture>
    </td>
  </tr>
  <tr>
    <td align="center">Catálogo</td>
    <td align="center">Apariencia</td>
  </tr>
</table>

## Instalación

Descarga la última versión desde [Releases](https://github.com/galexbh/ymd/releases/latest).

| Plataforma          | Archivo                                 | Notas                                                   |
| ------------------- | --------------------------------------- | ------------------------------------------------------- |
| Windows 10/11 (x64) | `ymd_<versión>_x64-setup.exe`           | Instalación por usuario, sin permisos de administrador. |
| macOS 11+           | `ymd_<versión>_universal.dmg`           | Universal: Apple Silicon e Intel.                       |
| Linux (x64)         | `ymd_<versión>_amd64.AppImage` / `.deb` |                                                         |

> [!NOTE]
> El instalador de Windows aún no tiene firma Authenticode, por lo que SmartScreen puede mostrar un aviso la primera vez. Selecciona **Más información → Ejecutar de todas formas**.

Al abrir ymd por primera vez, la pantalla de inicio instala lo necesario. Desde entonces ymd mantiene sus dependencias y se actualiza a sí misma.

## Dependencias

ymd descarga las herramientas en `%LOCALAPPDATA%\ymd\bin` (Windows) o en su carpeta de datos (macOS y Linux), sin instalar nada a nivel de sistema. La ubicación se puede cambiar en **Ajustes → Avanzado**.

| Herramienta                                                                              | Uso                                                 | Origen                                                                                               |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp)                                               | Motor de descarga                                   | Ejecutable oficial, verificado con `SHA2-256SUMS`; canal estable, nightly o master                   |
| [FFmpeg](https://ffmpeg.org/)                                                            | Unión de pistas, conversión y post-proceso          | [yt-dlp/FFmpeg-Builds](https://github.com/yt-dlp/FFmpeg-Builds) (Windows y Linux), Homebrew en macOS |
| [Deno](https://deno.com/)                                                                | Entorno JavaScript que yt-dlp necesita para YouTube | Se usa Node, Bun o QuickJS si ya están instalados                                                    |
| [aria2](https://aria2.github.io/), [AtomicParsley](https://github.com/wez/atomicparsley) | Opcionales                                          | Instalación desde la pantalla Dependencias                                                           |

## Cookies y cuentas

Algunos videos solo se descargan con una sesión iniciada. ymd ofrece varias opciones, todas opcionales:

- **Extensión ymd Cookies** para Brave, Chrome y Edge: sincroniza las cookies de los sitios que elijas mediante Native Messaging, sin red. En Windows es la vía recomendada para navegadores Chromium. Ver [`extension/README.md`](extension/README.md).
- **Cookies del navegador** (Firefox recomendado en Windows) o un archivo **`cookies.txt`** importado.
- **Cuentas por sitio**, guardadas en el llavero del sistema y entregadas a yt-dlp con `--netrc-cmd`.

Las contraseñas no se escriben en disco ni en los argumentos de los procesos. El archivo de cookies se guarda en la carpeta privada del usuario y se puede borrar desde **Ajustes → Cuentas**.

## Desarrollo

Requisitos: Node 22+, Rust estable y, en Linux, los [prerrequisitos de Tauri 2](https://v2.tauri.app/start/prerequisites/).

```sh
corepack enable
pnpm install

pnpm tauri dev        # aplicación en modo desarrollo
pnpm dev:mock         # solo la interfaz, en el navegador, con un backend simulado
pnpm test             # tests de la interfaz
pnpm e2e              # tests end-to-end (Playwright)
pnpm ext:build        # extensión ymd Cookies
pnpm tauri build      # instaladores en src-tauri/target/release/bundle
```

Los tests de Rust se ejecutan con `cargo test --features test-support` dentro de `src-tauri/`. La guía completa, las convenciones y el flujo de releases están en [CONTRIBUTING.md](CONTRIBUTING.md).

### Estructura

| Ruta         | Contenido                                                                               |
| ------------ | --------------------------------------------------------------------------------------- |
| `src/`       | Interfaz (React 19, TypeScript)                                                         |
| `src-tauri/` | Backend (Rust, Tauri 2): cola, dependencias, autenticación, historial                   |
| `extension/` | Extensión ymd Cookies (Manifest V3)                                                     |
| `e2e/`       | Tests end-to-end                                                                        |
| `docs/`      | Documentación técnica, como el [protocolo del puente de cookies](docs/cookie-bridge.md) |

## Licencia

ymd se distribuye bajo la [licencia MIT](LICENSE).

El nombre **ymd** y su logotipo identifican al proyecto oficial y no están incluidos en la licencia; los proyectos derivados deben usar un nombre y un logotipo propios.

El instalador no incluye yt-dlp ni FFmpeg. ymd los descarga desde sus fuentes oficiales cuando los necesita, y cada uno conserva su propia licencia: consulta la de [yt-dlp](https://github.com/yt-dlp/yt-dlp#license) y la de [FFmpeg](https://ffmpeg.org/legal.html).

## Aviso

ymd no está afiliado a YouTube ni a ningún otro sitio. Respeta los términos de servicio de cada sitio y descarga solo contenido que tengas derecho a guardar.

## Agradecimientos

[yt-dlp](https://github.com/yt-dlp/yt-dlp), [FFmpeg](https://ffmpeg.org/), [Deno](https://deno.com/), [Tauri](https://tauri.app/), [React](https://react.dev/) y [Lucide](https://lucide.dev/).
