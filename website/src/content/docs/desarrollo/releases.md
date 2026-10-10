---
title: Releases
description: Cómo se publica una versión de ymd y cómo se firman las actualizaciones.
---

## Publicar una versión

1. **Changelog:** añade la sección de la versión en [`CHANGELOG.md`](/ymd/changelog/). El cuerpo del release se genera a partir de esa sección (`scripts/release-notes.mjs`).
2. **Versión:** súbela en `package.json`, `src-tauri/Cargo.toml` y `src-tauri/tauri.conf.json`.
3. **Tag:** crea el tag `vX.Y.Z` y haz push.
4. **Borrador:** `release.yml` compila en Windows (NSIS), macOS (universal, `.dmg`) y Linux (`.AppImage` y `.deb`) y crea un release en borrador con los instaladores, sus `.sig`, `latest.json` y el zip de la extensión.
5. **Publicar:** revisa el borrador y publícalo. Las copias instaladas solo ven releases publicados.

## Actualizaciones firmadas

ymd se actualiza con `tauri-plugin-updater`: lee `releases/latest/download/latest.json` de GitHub y cada instalador va firmado (minisign). La clave pública vive en `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).

La clave privada nunca entra al repo:

- En CI está en los secretos `TAURI_SIGNING_PRIVATE_KEY` y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- En la máquina del mantenedor, fuera del repositorio, con su contraseña aparte.
- Si se pierde, las copias instaladas ya no aceptarán actualizaciones: habría que publicar una versión con otra clave e instalarla a mano.

Para generar un instalador en local (`pnpm tauri build`), exporta antes esas dos variables de entorno; sin ellas, el paso de firma del actualizador falla. `pnpm tauri build --no-bundle` compila sin empaquetar y no las necesita.

## Firma de código

Los instaladores de Windows no llevan firma de código (Authenticode), así que SmartScreen muestra un aviso en la primera instalación. La firma del actualizador es independiente: protege las actualizaciones automáticas.
