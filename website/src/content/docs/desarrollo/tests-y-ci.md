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
- `build-check` compila la app real (frontend, extensión y Tauri) en Linux en los PR que tocan la app.
- **En `main` corre todo**, sin importar las rutas: los tres sistemas en `build-check` y el informe de cobertura de Rust. Lo mismo al lanzarlo a mano (`workflow_dispatch`).

Los jobs omitidos cuentan como aprobados para la protección de rama.

## Otros workflows

| Workflow              | Cuándo                                                                 | Qué hace                                                                                |
| --------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `release.yml`         | tags `v*`                                                              | Instaladores firmados y release en borrador (ver [Releases](/ymd/desarrollo/releases/)) |
| `docs.yml`            | push a `main` que toca `website/**`, `CHANGELOG.md` o `docs/assets/**` | Publica este sitio en GitHub Pages                                                      |
| `nightly-smoke.yml`   | cada día                                                               | Descarga real con el yt-dlp nightly; abre un issue si falla                             |
| `supported-sites.yml` | cada semana                                                            | Actualiza la lista de sitios compatibles y abre un PR si cambió                         |
