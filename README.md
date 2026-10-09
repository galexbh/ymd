# ymd

**ymd** es una app de escritorio que convierte [yt-dlp](https://github.com/yt-dlp/yt-dlp) en una
herramienta tranquila y fiable: pegas un enlace, eliges video o audio y la calidad, y sigues con
lo tuyo. ymd instala y mantiene al día yt-dlp y sus dependencias, muestra el progreso en vivo y
recuerda lo que descargaste. Nunca hace falta abrir una terminal.

Windows, macOS y Linux. Interfaz en español e inglés.

> _English below._

## Funciones

- **Video o audio**: calidad y contenedor (MP4, MKV, WebM) o extracción de audio (MP3, M4A, Opus, FLAC).
- **Playlists**: completas o eligiendo entradas sueltas.
- **Cola concurrente** con progreso, velocidad y tiempo restante; cancelar y reintentar.
- **Historial** con búsqueda, "abrir archivo" y "abrir carpeta".
- **Post-proceso**: miniatura, metadatos y subtítulos incrustados; SponsorBlock.
- **Presets** editables, cada uno con su propia carpeta si quieres.
- **Dependencias gestionadas**: instala, verifica (SHA-256) y actualiza yt-dlp, ffmpeg y el resto con un clic.
- **Errores que dicen qué hacer**: "cierra Brave y reintenta", "usa las cookies de tu navegador"…
- **Temas claro y oscuro** con color de acento, densidad, radio y tamaño de texto personalizables.

## Capturas

_Pendiente: se añadirán cuando termine el rediseño (tema claro y oscuro)._

## Instalación

Descarga el instalador desde [Releases](../../releases):

- **Windows**: `ymd_x.y.z_x64-setup.exe` (NSIS). Se instala **solo para tu usuario, sin pedir
  permisos de administrador**, con selector de idioma. Al no estar firmado todavía, SmartScreen
  puede mostrar un aviso ("Más información" → "Ejecutar de todas formas").
- **macOS**: `.dmg` universal (Apple Silicon e Intel).
- **Linux**: `.AppImage` o `.deb`.

## Dependencias

En el primer arranque, ymd ofrece instalar lo necesario en una carpeta propia
(Windows: `%LOCALAPPDATA%\ymd\bin`; se puede cambiar en Ajustes). Nada se instala a nivel sistema.

| Dependencia                               | Nivel                    | Para qué                                          | Cómo la resuelve ymd                                                                                                  |
| ----------------------------------------- | ------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **yt-dlp**                                | Requerida                | El motor de descarga                              | Descarga el ejecutable oficial (que ya incluye curl_cffi, mutagen, etc.), verifica `SHA2-256SUMS` y lo actualiza solo |
| **ffmpeg + ffprobe**                      | Requerida en la práctica | Unir video y audio, convertir a MP3, post-proceso | Builds de `yt-dlp/FFmpeg-Builds` (Windows/Linux); en macOS usa Homebrew si existe o un build estático                 |
| **Runtime JS** (Deno, Node, Bun, QuickJS) | Recomendada              | Resolver los desafíos JS de YouTube               | Detecta uno instalado; si no hay, "Instalar Deno" con un clic                                                         |
| **aria2c**                                | Opcional                 | Descargas más rápidas                             | Un clic en Windows; en macOS/Linux muestra el comando (`brew`/`apt`)                                                  |
| **AtomicParsley**                         | Opcional                 | Miniaturas en mp4/m4a en casos raros              | Un clic en las tres plataformas                                                                                       |

Si una fuente no publica checksum, la app lo marca como "sin verificación" y descarga por HTTPS
desde el host oficial.

## Autenticación

Para videos con restricción de edad, privados o cuando el sitio pide "confirma que no eres un
bot", ymd usa, por capas y siempre de forma opcional:

1. **Cookies del navegador** (`--cookies-from-browser`), con soporte de primera para los
   perfiles de **Brave**. Como los navegadores Chromium bloquean su base de cookies mientras
   están abiertos, ymd puede crear una **instantánea** (con el navegador cerrado) y usarla
   después aunque lo vuelvas a abrir. También puedes importar un `cookies.txt`.
2. **Cuentas por sitio** guardadas en el **llavero del sistema** (Administrador de credenciales,
   Llavero de macOS, Secret Service) y entregadas a yt-dlp con `--netrc-cmd`: la contraseña
   nunca toca el disco ni los argumentos del proceso.
3. **Contraseña de video y código 2FA**: se piden en el momento y no se guardan.

Todo se borra con un clic desde Ajustes.

## Compilar desde el código

```sh
corepack enable
pnpm install
pnpm tauri dev          # desarrollo
pnpm tauri build        # instaladores en src-tauri/target/release/bundle
pnpm dev:mock           # solo la interfaz en el navegador, con un backend simulado
```

Requisitos: Node 22+, Rust estable y, en Linux, las
[dependencias de Tauri v2](https://v2.tauri.app/start/prerequisites/). Guía completa, tests y
normas en [CONTRIBUTING.md](CONTRIBUTING.md).

## Licencias

- yt-dlp se publica bajo [Unlicense](https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE), pero
  sus ejecutables oficiales (PyInstaller) incluyen componentes bajo **GPLv3+**.
- Los builds de ffmpeg que se usan son **GPL**.
- Por eso **ninguno se incluye en el instalador**: ymd los descarga en tiempo de ejecución desde
  sus fuentes oficiales, a petición del usuario.

## Uso responsable

ymd es una herramienta para el usuario. Descargar contenido puede ir contra los términos de
servicio de algunos sitios o contra los derechos de autor. **Respeta los términos de cada sitio y
descarga solo contenido que tengas derecho a guardar.**

## Créditos

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) y sus colaboradores — todo el trabajo duro.
- [FFmpeg](https://ffmpeg.org/) y [yt-dlp/FFmpeg-Builds](https://github.com/yt-dlp/FFmpeg-Builds).
- [Deno](https://deno.com/), [aria2](https://aria2.github.io/), [AtomicParsley](https://github.com/wez/atomicparsley).
- [Tauri](https://tauri.app/), [React](https://react.dev/), [Lucide](https://lucide.dev/).

ymd usa su propio logotipo y no está afiliado a YouTube ni a ningún otro sitio.

---

## English

**ymd** is a calm desktop front end for yt-dlp (Windows, macOS, Linux; Spanish and English UI).
Paste a link, pick video or audio and a quality, and move on. ymd installs, verifies (SHA-256)
and auto-updates yt-dlp, ffmpeg and an optional JS runtime into a per-user folder; it runs a
concurrent download queue with live progress, supports playlists, keeps a searchable history and
turns yt-dlp errors into next steps.

- **Install**: grab the installer from Releases. On Windows it's a per-user NSIS installer (no
  admin rights); macOS gets a universal `.dmg`; Linux an `.AppImage` or `.deb`.
- **Auth**: browser cookies (first-class Brave profile support, plus a cookie snapshot taken while
  the browser is closed), an imported `cookies.txt`, or site accounts stored in the OS keychain
  and handed to yt-dlp via `--netrc-cmd`. No plaintext secrets on disk or in process arguments.
- **Build**: `corepack enable && pnpm install && pnpm tauri dev`; `pnpm dev:mock` runs the UI in a
  browser against a simulated backend. See [CONTRIBUTING.md](CONTRIBUTING.md).
- **Licenses**: yt-dlp is Unlicense, but its PyInstaller executables bundle GPLv3+ code; ffmpeg
  builds are GPL. Neither is bundled — both are downloaded at runtime.
- **Terms of use**: respect each site's terms and copyright; only download what you have the
  right to keep.
