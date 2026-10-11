---
title: Tests y CI
description: Qué tests hay, dónde viven y qué ejecuta cada workflow.
---

## Dónde viven los tests

| Capa               | Dónde                                             | Herramienta                                                                         |
| ------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Rust, unitarios    | junto al código (`#[cfg(test)] mod tests`)        | `cargo test`, `insta` para snapshots de argv                                        |
| Rust, integración  | `src-tauri/tests/*.rs`                            | yt-dlp falso, `httpmock`, `tempfile`                                                |
| Rust, smoke real   | tests `#[ignore]` llamados `smoke_*`              | solo en `nightly-smoke.yml`                                                         |
| Frontend           | `src/**/__tests__/*.test.ts(x)` o junto al módulo | Vitest + Testing Library + backend simulado                                         |
| Invariantes        | `src/i18n`, `src/theme`                           | Vitest: claves es/en idénticas, contraste AA, tokens                                |
| E2E de la interfaz | `e2e/*.spec.ts`                                   | Playwright + backend simulado                                                       |
| Extensión          | `extension/src/**/__tests__`, `extension/e2e`     | Vitest con un `chrome.*` falso; Playwright con Chromium real y un host nativo falso |
| Documentación      | `website/`                                        | `pnpm docs:build` con validación de enlaces internos                                |

## CI (`ci.yml`)

Es la puerta de cada cambio: nada se fusiona sin todos los jobs en verde. Un job `changes` decide qué áreas toca el cambio con filtros de rutas:

| Filtro      | Rutas principales                                                           | Jobs                                                          |
| ----------- | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `rust`      | `src-tauri/**`                                                              | `rust` (fmt, clippy, tests en Windows, macOS y Linux)         |
| `frontend`  | `src/**`, `e2e/**`, `public/**`, configuración de Vite, TypeScript y ESLint | `frontend` (lint, tipos, unitarios con cobertura, build, e2e) |
| `extension` | `extension/**`, `src/styles/**`                                             | `extension` (lint, unitarios, build, zip, e2e)                |
| `deps`      | `package.json`, `pnpm-lock.yaml`, `Cargo.toml`, `Cargo.lock`                | `audit` (pnpm audit y cargo audit)                            |
| `website`   | `website/**`, `CHANGELOG.md`, `docs/assets/**`                              | `docs` (compila el sitio y valida enlaces)                    |

- Un cambio en `ci.yml` activa todos los filtros.
- `format` (Prettier) corre siempre, porque cubre también la documentación.
- En Linux, el job `rust` corre los tests con `cargo llvm-cov` en lugar de `cargo test`: la misma suite, que también genera el informe de cobertura (resumen en la ejecución y artefacto `rust-coverage`, sin umbral). Windows y macOS usan `cargo test`.
- `build-check` compila la app real (frontend, extensión y Tauri, en modo debug y sin instaladores) solo en Linux, con su propia caché de Rust. Los instaladores de los tres sistemas se compilan en `release.yml`.
- clippy, los tests y las compilaciones de CI usan `--locked`: si `Cargo.lock` no está al día, CI falla en vez de actualizarlo.
- **En `main` corre todo**, sin importar las rutas. Lo mismo al lanzarlo a mano (`workflow_dispatch`).
- Un push nuevo a un PR cancela la ejecución anterior de ese PR; en `main` cada push termina su ejecución.

Los jobs omitidos cuentan como aprobados para la protección de rama.

## Cachés

GitHub da 10 GB de caché por repositorio. Las cachés de Rust se guardan solo desde `main` (los PR las leen sin sobrescribirlas) y hay una por propósito y sistema: `debug` (job `rust`), `build` (`build-check`) y `release-<sistema>` (instaladores).

Una caché guardada desde un tag solo la puede leer ese tag, así que `release.yml` no guarda la suya: la prepara `warm-release-cache.yml`, que compila en `main` los mismos binarios de release (mismos runners, targets y variables de entorno). Si se cambia la matriz o el entorno de `release.yml`, hay que cambiar ese workflow igual.

## Otros workflows

| Workflow                 | Cuándo                                                                  | Qué hace                                                                                           |
| ------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `release.yml`            | tags `v*`                                                               | Instaladores firmados y release en borrador (ver [Releases](/ymd/desarrollo/releases/))            |
| `docs.yml`               | push a `main` que toca `website/**`, `CHANGELOG.md` o `docs/assets/**`  | Publica este sitio en GitHub Pages                                                                 |
| `nightly-smoke.yml`      | cada día                                                                | Descarga real con el yt-dlp nightly; abre un issue si falla                                        |
| `supported-sites.yml`    | cada semana                                                             | Actualiza la lista de sitios compatibles y abre un PR si cambió                                    |
| `warm-release-cache.yml` | push a `main` que toca `Cargo.lock` o `Cargo.toml`, cada semana, a mano | Compila los binarios de release sin instaladores y guarda la caché que lee `release.yml`           |
| `cache-cleanup.yml`      | al cerrar un PR; cada día; a mano                                       | Borra las cachés del PR cerrado; en `main` deja solo la caché más reciente de cada grupo de claves |
