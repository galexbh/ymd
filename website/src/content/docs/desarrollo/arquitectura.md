---
title: Arquitectura
description: Módulos de Rust, frontend, contrato IPC y backend simulado.
---

ymd es una aplicación [Tauri 2](https://v2.tauri.app/): un backend en Rust (`src-tauri/`) y una interfaz en React 19 y TypeScript (`src/`) que se comunican por IPC.

| Ruta         | Contenido                                                             |
| ------------ | --------------------------------------------------------------------- |
| `src/`       | Interfaz (React 19, TypeScript, Vite, zustand, i18next)               |
| `src-tauri/` | Backend (Rust, Tauri 2): cola, dependencias, autenticación, historial |
| `extension/` | Extensión ymd Cookies (Manifest V3)                                   |
| `e2e/`       | Tests end-to-end (Playwright)                                         |
| `website/`   | Este sitio de documentación (Astro Starlight)                         |

## Backend (`src-tauri/src/`)

- **`model.rs`**: todos los tipos del IPC (serde, camelCase). Es la fuente de verdad del contrato.
- **`commands/`**: capa fina de `#[tauri::command]` (dependencias, trabajos, historial, ajustes, autenticación).
- **`deps/`**: herramientas gestionadas.
  - `catalog.rs`: datos puros; qué archivo descargar por sistema y arquitectura, y cómo verificarlo.
  - `manager.rs`: descarga, verificación SHA-256 y reemplazo atómico.
  - `jsruntime.rs`: detección de Deno, Node, Bun y QuickJS.
- **`ytdlp/`**: integración con yt-dlp.
  - `args.rs`: construye la lista argv (función pura, con snapshots de `insta`).
  - `progress.rs`: interpreta las marcas de progreso de la salida estándar.
  - `errors.rs`: traduce stderr a un `ErrorCode` (ver [Solución de problemas](/ymd/solucion-de-problemas/)).
  - `probe.rs`: convierte la salida de `-J` en la ficha del enlace.
- **`jobs.rs`**: la cola, con un semáforo para la concurrencia; cancelar mata el árbol de procesos.
- **`history.rs`**: el catálogo, en SQLite.
- **`settings.rs`**: ajustes en JSON, saneados al leer.
- **`auth/`**: navegadores y perfiles, cookies, llavero del sistema, ayudante `--netrc-cmd`, y el host nativo del [puente de cookies](/ymd/desarrollo/puente-de-cookies/) con su registro en los navegadores.
- **`paths.rs`**, **`process.rs`** (procesos sin consola, en su propio grupo), **`state.rs`**.

## Frontend (`src/`)

- **`ipc/`**: `types.ts` (espejo de `model.rs`), `commands.ts` (el único sitio que llama a `invoke`), `events.ts` (`listen` tipado) y `mock/` (backend simulado).
- **`screens/`**: Recibir, Registro, Catálogo, Dependencias, Ajustes y la pantalla de inicio.
- **`ui/`**: componentes primitivos. **`store/`**: estado con zustand. **`theme/`** y **`styles/`**: tokens de diseño y temas. **`i18n/`**: textos en español e inglés.

## Contrato IPC

Un comando o evento nuevo se añade en un solo commit:

1. `src-tauri/src/model.rs`: tipos serde (camelCase).
2. `src-tauri/src/commands/*.rs`: el `#[tauri::command]` y su registro en `lib.rs`.
3. `src/ipc/types.ts`: el espejo TypeScript de los tipos.
4. `src/ipc/commands.ts` (o `events.ts`): el wrapper tipado.
5. `src/ipc/mock/backend.ts`: su implementación en el backend simulado; si falta, el modo mock y los tests fallan con `unhandled command`.
6. Tests: Rust para la lógica, un test del mock y los de la pantalla que lo use.

## Backend simulado

`src/ipc/mock/` implementa todo el contrato en memoria. Lo usan `pnpm dev:mock`, los tests de Vitest y los e2e de Playwright.

```ts
import { installMockBackend } from "../ipc/mock";
const be = installMockBackend({ scenario: "first-run", clock: "manual" });
// ... renderizar, hacer clic en "Instalar" ...
await be.manualClock.advanceAsync(2000);
```

Escenarios: `first-run`, `ready`, `outdated`, `complete`. Las URL que contienen `bot`, `private`, `age` o `geo` fallan con el error correspondiente; `notfound` y `offline` fallan al revisar el enlace.

En Rust, los tests de integración usan un yt-dlp falso (`src-tauri/tests/support/fake_ytdlp.rs`, feature `test-support`) controlado por variables de entorno.
