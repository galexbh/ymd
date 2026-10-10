---
title: Contribuir
description: Puesta en marcha, comandos y reglas del proyecto.
---

Resumen de la guía para contribuir. La versión completa está en [CONTRIBUTING.md](https://github.com/galexbh/ymd/blob/main/CONTRIBUTING.md).

## La regla

**Todo cambio entra con tests, y CI debe estar en verde.** Ningún PR se fusiona con tests en rojo, sin tests para el comportamiento nuevo o con un job de CI fallando. Si un test falla por algo que no tocaste, se arregla o se reporta; no se desactiva.

## Puesta en marcha

Requisitos: Node 22+, Rust estable (`rustup`) y, en Linux, las [dependencias de Tauri 2](https://v2.tauri.app/start/prerequisites/).

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

Antes de abrir un PR: `pnpm check && pnpm test:rust && pnpm lint:rust`.

## Convenciones

- **Contrato IPC:** un comando nuevo toca, en el mismo commit, `model.rs`, el comando Rust, `src/ipc/types.ts`, `commands.ts` o `events.ts`, el backend falso y sus tests. Ver [Arquitectura](/ymd/desarrollo/arquitectura/).
- **i18n:** español e inglés con claves idénticas (hay un test). Ningún texto en duro en componentes.
- **Diseño:** en componentes solo se usan tokens (variables CSS del tema); todo cambio visual se revisa en tema claro y oscuro.
- **Seguridad:** yt-dlp y demás herramientas se ejecutan siempre con una lista argv, nunca con una shell. Ningún secreto en disco en texto plano ni en argumentos de proceso.
- **Commits:** en imperativo y concisos. Si el cambio lo escribió o coescribió una IA, añade la línea de atribución `Co-Authored-By`.

## Documentación

Este sitio vive en `website/` (Astro Starlight) y se publica en GitHub Pages al fusionar en `main`. Cada página tiene su versión en español (raíz) y en inglés (`en/`); un cambio de comportamiento de la app actualiza ambas.
