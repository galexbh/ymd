# Contribuir a ymd

> **English summary** at the end.

## La regla

**Todo cambio entra con tests, y CI debe estar en verde.** Ningún PR se fusiona con tests en
rojo, sin tests para el comportamiento nuevo, o con un job de CI fallando. Si un test falla por
algo que no tocaste, se arregla o se reporta; no se desactiva.

## Puesta en marcha

Requisitos: Node 22+, Rust estable (`rustup`), y en Linux las
[dependencias de Tauri v2](https://v2.tauri.app/start/prerequisites/) (`libwebkit2gtk-4.1-dev`,
`librsvg2-dev`, `libayatana-appindicator3-dev`, `libxdo-dev`, `libssl-dev`, `libdbus-1-dev`, …).

pnpm se usa a través de **corepack** (la versión exacta está en `package.json` →
`packageManager`), así que no hace falta instalarlo globalmente:

```sh
corepack enable            # una vez (o usa "corepack pnpm ..." en cada comando)
pnpm install
pnpm tauri dev             # app de escritorio completa (Rust + webview)
```

### Modo mock (solo navegador)

```sh
pnpm dev:mock              # http://localhost:1420
```

Arranca el frontend con un **backend falso con estado** (`src/ipc/mock/`) en lugar de Rust:
dependencias, descargas con progreso, historial, ajustes, cookies y credenciales, todo en
memoria y sin red. Parámetros en la URL (se recuerdan en `localStorage`):

| Parámetro  | Valores                                                | Efecto                                |
| ---------- | ------------------------------------------------------ | ------------------------------------- |
| `scenario` | `first-run`, `ready` (defecto), `outdated`, `complete` | Estado de dependencias                |
| `speed`    | número, p. ej. `4`                                     | Acelera las descargas simuladas       |
| `brave`    | `closed`                                               | Brave cerrado (las cookies funcionan) |

En la consola del navegador, `window.__YMD_MOCK__` da acceso al backend (por ejemplo
`__YMD_MOCK__.setScenario("first-run")`). URLs que contienen `bot`, `private`, `age` o `geo`
fallan con el error correspondiente; `notfound` y `offline` fallan en el análisis (probe).

## Comandos

| Comando                             | Qué hace                                                         |
| ----------------------------------- | ---------------------------------------------------------------- |
| `pnpm lint` / `pnpm lint:fix`       | ESLint (typescript-eslint, react-hooks, react-refresh)           |
| `pnpm format` / `pnpm format:check` | Prettier                                                         |
| `pnpm typecheck`                    | `tsc` de la app y de la configuración (Vite, Playwright, e2e)    |
| `pnpm test` / `pnpm test:watch`     | Vitest (jsdom)                                                   |
| `pnpm test:coverage`                | Vitest con cobertura v8 (umbral 80 % en módulos puros)           |
| `pnpm e2e`                          | Playwright contra `dev:mock` (`pnpm e2e:install` la primera vez) |
| `pnpm test:rust`                    | `cargo test --features test-support`                             |
| `pnpm lint:rust`                    | `cargo fmt --check` + `cargo clippy -D warnings`                 |
| `pnpm check`                        | lint + formato + tipos + tests del frontend                      |

Antes de abrir un PR: `pnpm check && pnpm test:rust && pnpm lint:rust`.

## Dónde viven los tests

| Capa                              | Dónde                                                            | Herramienta                                                           |
| --------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| Rust, unitarios                   | junto al código (`#[cfg(test)] mod tests`) en `src-tauri/src/**` | `cargo test`, `insta` para snapshots de argv                          |
| Rust, integración                 | `src-tauri/tests/*.rs`                                           | yt-dlp falso (`fake-ytdlp`, `tests/support/`), `httpmock`, `tempfile` |
| Rust, smoke real                  | tests `#[ignore]` llamados `smoke_*`                             | solo en `nightly-smoke.yml`                                           |
| Frontend, unitarios y componentes | `src/**/__tests__/*.test.ts(x)` o `*.test.ts(x)` junto al módulo | Vitest + Testing Library + mock backend                               |
| Invariantes                       | `src/i18n`, `src/theme`                                          | Vitest (claves es/en idénticas, contraste AA, tokens en ambos temas)  |
| E2E de UI                         | `e2e/*.spec.ts`                                                  | Playwright + mock backend (ver `e2e/README.md`)                       |

En tests de frontend usa el backend falso en vez de mocks a mano:

```ts
import { installMockBackend } from "../ipc/mock"; // ruta relativa desde el test
const be = installMockBackend({ scenario: "first-run", clock: "manual" });
// ... renderizar, hacer clic en "Instalar" ...
await be.manualClock.advanceAsync(2000); // avanza el tiempo simulado
```

`src/test/setup.ts` limpia el DOM, el backend y los mocks de Tauri después de cada test.

### El yt-dlp falso

`src-tauri/tests/support/fake_ytdlp.rs` se compila con `--features test-support` y se obtiene en
tests con `env!("CARGO_BIN_EXE_fake-ytdlp")`. Se controla por variables de entorno:
`FAKE_YTDLP_SCENARIO` (`success`, `playlist`, `error-bot`, `error-private`, `error-ffmpeg`,
`hang`, `probe-video`, `probe-playlist`), `FAKE_YTDLP_SCRIPT` (guion propio: `out`, `err`,
`sleep`, `hang`, `touch`, `cat`, `exit`) y `FAKE_YTDLP_ARGV_FILE` (registra el argv recibido).

## Cómo añadir un comando IPC

Todo en **el mismo commit**:

1. `src-tauri/src/model.rs` — tipos serde (camelCase).
2. `src-tauri/src/commands/*.rs` — el `#[tauri::command]` y su registro en `lib.rs`.
3. `src/ipc/types.ts` — el espejo TypeScript de los tipos.
4. `src/ipc/commands.ts` (o `events.ts`) — el wrapper tipado; es el único sitio que llama a `invoke`.
5. `src/ipc/mock/backend.ts` — implementación en el backend falso (si no, el modo mock y los tests fallan con `unhandled command`).
6. Tests: Rust para la lógica, un test del mock en `src/ipc/mock/__tests__`, y los de la pantalla que lo use.

## i18n

Español e inglés. **Las claves de `es` y `en` son idénticas**; un test lo comprueba. No hay
textos en duro en componentes. Al añadir una clave, añádela en ambos idiomas en el mismo commit.

## Temas y diseño

Lee `PRODUCT.md` (y `DESIGN.md` cuando exista). En componentes **solo se usan tokens**
(variables CSS del tema): nada de hex, rgb ni tamaños sueltos. Todo cambio visual se revisa en
tema claro y oscuro. Respeta `prefers-reduced-motion` y el foco visible.

## Seguridad

- yt-dlp y demás herramientas se ejecutan **siempre con una lista argv**, nunca a través de una shell.
- Ningún secreto en disco en texto plano ni en argumentos de proceso. Las cuentas van al llavero
  del sistema y llegan a yt-dlp con `--netrc-cmd`; contraseñas de video y 2FA solo en memoria.
- El `cookies.txt` propio de ymd se crea con permisos solo para el usuario (0600 / ACL).
- Nunca se suben binarios descargados ni material de autenticación (ver `.gitignore`).

## Releases y auto-actualización

- ymd se actualiza sola con `tauri-plugin-updater`. Lee `releases/latest/download/latest.json` de GitHub, y cada instalador va firmado (minisign). La clave pública vive en `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).
- La clave privada **nunca** entra al repo:
  - En CI está en los secretos `TAURI_SIGNING_PRIVATE_KEY` y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
  - En la máquina del mantenedor está en `~/.tauri/ymd-updater.key`, con su contraseña aparte.
  - Si se pierde, las copias instaladas ya no aceptarán actualizaciones: habría que publicar una versión nueva con otra clave e instalarla a mano.
- Para publicar:
  1. Subir la versión en `package.json`, `src-tauri/Cargo.toml` y `src-tauri/tauri.conf.json`.
  2. Crear el tag `vX.Y.Z` y hacer push.
  3. `release.yml` crea un release en borrador con los instaladores, los `.sig` y `latest.json`.
  4. Revisarlo y **publicarlo**: las copias instaladas solo ven releases publicados.
- Para generar un instalador en local (`pnpm tauri build`), exporta antes las dos variables de entorno de firma. Sin ellas, el paso de firma del actualizador falla. Para compilar sin empaquetar, `pnpm tauri build --no-bundle` no las necesita.
- Los instaladores de Windows no llevan firma de código (Authenticode), así que SmartScreen muestra un aviso en la primera instalación.

## Commits

Mensajes en imperativo y concisos ("Add cookie snapshot command"). Si el cambio lo escribió o
coescribió una IA, añade al final la línea de atribución, por ejemplo:

```
Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## English summary

- **Rule: every change ships with tests, and CI must be green.** No merging with red tests.
- Setup: `corepack enable && pnpm install && pnpm tauri dev`. Browser-only mode with a stateful
  fake backend: `pnpm dev:mock` (`?scenario=first-run|ready|outdated|complete&speed=4&brave=closed`;
  `window.__YMD_MOCK__` in devtools).
- Commands: `pnpm check` (lint, format, types, unit), `pnpm test:coverage`, `pnpm e2e`,
  `pnpm test:rust`, `pnpm lint:rust`.
- Tests: Rust unit tests next to code, integration in `src-tauri/tests` (fake yt-dlp,
  httpmock); frontend tests in `__tests__`/`*.test.ts(x)` using `installMockBackend()`;
  Playwright in `e2e/`.
- New IPC command = `model.rs` + command + `types.ts` + `commands.ts`/`events.ts` + mock + tests,
  in one commit.
- i18n: `es` and `en` keys must be identical. Theming: tokens only, check light and dark.
- Security: argv only (no shell), no secrets on disk or in argv, owner-only cookie file.
- Add an AI co-author trailer to commits written with an AI assistant.
