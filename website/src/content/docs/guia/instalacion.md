---
title: Instalación
description: Cómo instalar ymd en Windows, macOS y Linux.
---

Descarga la última versión desde la [página de releases](https://github.com/galexbh/ymd/releases/latest) del repositorio.

| Plataforma          | Archivo                                 | Notas                                                   |
| ------------------- | --------------------------------------- | ------------------------------------------------------- |
| Windows 10/11 (x64) | `ymd_<versión>_x64-setup.exe`           | Instalación por usuario, sin permisos de administrador. |
| macOS 11+           | `ymd_<versión>_universal.dmg`           | Universal: Apple Silicon e Intel.                       |
| Linux (x64)         | `ymd_<versión>_amd64.AppImage` / `.deb` |                                                         |

El instalador no incluye yt-dlp ni FFmpeg. ymd los descarga desde sus fuentes oficiales la primera vez que lo abres (ver [Primer uso](/ymd/guia/primer-uso/)).

## Windows

1. Descarga `ymd_<versión>_x64-setup.exe`.
2. Ejecútalo. El instalador (NSIS) instala ymd solo para tu usuario y no pide permisos de administrador.
3. Abre ymd desde el menú Inicio.

### Aviso de SmartScreen

El instalador aún no tiene firma de código (Authenticode), así que Windows SmartScreen puede mostrar «Windows protegió su PC» la primera vez. Selecciona **Más información** y luego **Ejecutar de todas formas**.

Las actualizaciones posteriores de ymd sí van firmadas para el actualizador integrado (ver [Actualizaciones](/ymd/guia/actualizaciones/)); SmartScreen solo interviene en la instalación manual.

## macOS

1. Descarga `ymd_<versión>_universal.dmg`. Funciona en Apple Silicon e Intel.
2. Abre el `.dmg` y arrastra ymd a **Aplicaciones**.

En macOS no hay una compilación de FFmpeg que ymd pueda descargar. La pantalla **Dependencias** muestra el comando para instalarlo con Homebrew: `brew install ffmpeg`.

## Linux

- **AppImage:** descarga `ymd_<versión>_amd64.AppImage`, dale permiso de ejecución (`chmod +x`) y ábrelo.
- **Debian y Ubuntu:** instala el `.deb` con `sudo apt install ./ymd_<versión>_amd64.deb`.

## Desinstalar

- **Windows:** desde **Configuración → Aplicaciones**. El desinstalador también borra el registro del puente de cookies del navegador.
- **macOS:** arrastra ymd desde **Aplicaciones** a la papelera.
- **Linux:** borra el AppImage o desinstala el paquete.

Las herramientas descargadas viven en la [carpeta de herramientas](/ymd/dependencias/#carpeta-de-herramientas), fuera de la instalación de ymd. Puedes borrarlas a mano si ya no las necesitas.
