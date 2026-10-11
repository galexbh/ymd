---
title: Contribuir
description: Puesta en marcha, comandos y requisitos para fusionar cambios.
---

Resumen de la guía para contribuir. La versión completa está en [CONTRIBUTING.md](https://github.com/galexbh/ymd/blob/main/.github/CONTRIBUTING.md).

## Puesta en marcha

Requisitos: Node 24+, Rust estable (`rustup`) y, en Linux, las [dependencias de Tauri 2](https://v2.tauri.app/start/prerequisites/).

pnpm se usa a través de corepack; la versión exacta está en `package.json` → `packageManager`.

```sh
corepack enable        # una vez (o "corepack pnpm ..." en cada comando)
pnpm install
pnpm tauri dev         # app de escritorio completa (Rust + webview)
pnpm dev:mock          # solo la interfaz, en http://localhost:1420, con un backend simulado
```

El modo mock arranca el frontend con un backend falso con estado (`src/ipc/mock/`): dependencias, descargas con progreso, historial, ajustes, cookies y credenciales, en memoria y sin red. Acepta parámetros en la URL (`?scenario=first-run|ready|outdated|complete`, `speed=4`, `brave=closed`) y expone `window.__YMD_MOCK__` en la consola.

## Comandos

| Comando              | Qué hace                                         |
| -------------------- | ------------------------------------------------ |
| `pnpm check`         | lint + formato + tipos + tests del frontend      |
| `pnpm test:coverage` | Vitest con cobertura v8                          |
| `pnpm e2e`           | Playwright contra `dev:mock`                     |
| `pnpm test:rust`     | `cargo test --features test-support`             |
| `pnpm lint:rust`     | `cargo fmt --check` + `cargo clippy -D warnings` |
| `pnpm ext:test`      | Tests de la extensión ymd Cookies                |
| `pnpm docs:dev`      | Este sitio de documentación, en modo desarrollo  |
| `pnpm docs:build`    | Compila el sitio y valida sus enlaces internos   |

Comprobación local completa: `pnpm check && pnpm test:rust && pnpm lint:rust`.

## Requisitos para fusionar

Un PR se fusiona cuando cumple estos requisitos. El detalle está en [CONTRIBUTING.md](https://github.com/galexbh/ymd/blob/main/.github/CONTRIBUTING.md).

- **Tests y CI:** el cambio incluye tests para el comportamiento nuevo o modificado, y todos los jobs de CI pasan (ver [Tests y CI](/ymd/desarrollo/tests-y-ci/)).
- **Contrato IPC:** los comandos y eventos se mantienen sincronizados entre `model.rs`, el comando Rust, `src/ipc/types.ts`, `commands.ts` o `events.ts`, el backend simulado y sus tests (ver [Arquitectura](/ymd/desarrollo/arquitectura/#contrato-ipc)).
- **i18n:** español e inglés con claves idénticas; los componentes no contienen textos fijos.
- **Diseño:** los componentes solo usan tokens (variables CSS del tema), y los cambios visuales se revisan en tema claro y oscuro.
- **Seguridad:** yt-dlp y las demás herramientas se ejecutan con una lista argv, nunca con una shell. Ningún secreto se guarda en disco en texto plano ni pasa por argumentos de proceso.
- **Documentación:** los cambios visibles para el usuario se reflejan en las páginas en español y en inglés.

## Documentación

Este sitio está en `website/` (Astro Starlight) y se publica en GitHub Pages con cada fusión en `main`. Las páginas en español están en la raíz y las inglesas en `en/`, con los mismos nombres de archivo.
