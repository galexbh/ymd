# Changelog

Todas las versiones notables de ymd. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); las versiones siguen [SemVer](https://semver.org/lang/es/).

## [0.2.0] - 2026-10-10

Primera versión pública: ymd pasa de prototipo a una app completa para descargar video y música con yt-dlp, sin terminal.

### Novedades

- **Descargas**
  - Descarga de video (mejor calidad, MP4 1080p, MP4 720p) o audio (MP3 320, audio original m4a/opus).
  - Progreso exacto: bytes reales, velocidad y tiempo restante.
  - Playlists con selección de entradas en una cuadrícula de miniaturas.
  - Cola con varias descargas a la vez (1–8), cancelar, reintentar y limpiar terminados.
  - Post-proceso: miniatura, metadatos y subtítulos incrustados, y SponsorBlock.
  - Preajustes editables y carpetas separadas para videos y música; también se puede elegir la carpeta en cada descarga.
- **Detección de enlaces copiados**
  - Al volver a ymd, si copiaste un enlace de YouTube, Vimeo, SoundCloud, TikTok, X, Instagram, Twitch, Bandcamp u otro proveedor conocido, se pega y se revisa solo, con «Deshacer».
  - Configurable en Ajustes → Descargas (apagado / sitios conocidos / cualquier enlace). Nunca guarda lo que copias.
- **Catálogo**
  - Historial con búsqueda por título, enlace, archivo o número de ingreso.
  - Abrir el archivo o su carpeta, volver a descargar y borrar.
- **Dependencias en un clic**
  - yt-dlp, ffmpeg/ffprobe y Deno se instalan en `%LOCALAPPDATA%\ymd\bin` (o la carpeta de datos en macOS/Linux), verificados con SHA-256.
  - yt-dlp se actualiza solo en el canal elegido (estable, nightly o master). Si la copia del sistema está vieja, ymd instala la suya.
  - Detecta Deno, Node, Bun o QuickJS y lo pasa a yt-dlp. aria2c y AtomicParsley son opcionales.
- **Cuentas y cookies**
  - **Extensión «ymd Cookies» para Brave, Chrome y Edge.** Envía a ymd las cookies de los sitios que elijas cuando cambian, con el navegador abierto y sin exportar archivos. Llega por Native Messaging, sin red. ymd registra el puente solo y la tarjeta en Ajustes → Cuentas guía la instalación.
  - Cookies del navegador (Firefox recomendado en Windows), con detección de perfiles y botón «Probar cookies».
  - Importación guiada de `cookies.txt`.
  - Cuentas por sitio guardadas en el llavero del sistema, con un buscador de los sitios que admiten cuenta en yt-dlp.
  - Lista con búsqueda de los ~1.700 sitios compatibles con yt-dlp y ayuda «¿Cómo agrego más?».
- **Errores que explican qué hacer**
  - Cada fallo de yt-dlp se traduce en un mensaje con su arreglo directo: verificación anti-bot, restricción de edad, cookies bloqueadas o cifradas, ffmpeg faltante, sin conexión, disco lleno…
- **Apariencia**
  - Diseño «Registro de archivo»: cada descarga es un ingreso numerado que se sella como ARCHIVADO con su fecha.
  - Tema claro y oscuro, color de acento personalizable (ajustado para mantener el contraste), densidad, esquinas y tamaño de texto.
  - Español e inglés.
- **Auto-actualización de ymd**
  - Las nuevas versiones se descargan firmadas desde GitHub Releases y se instalan con un clic.
- **Instalador**
  - NSIS por usuario, sin permisos de administrador. También `.dmg` para macOS y `.AppImage`/`.deb` para Linux.

### Seguridad y privacidad

- Las contraseñas de sitios viven solo en el llavero del sistema; nunca en disco ni en los argumentos de procesos.
- `cookies.txt` se guarda en la carpeta privada del usuario, con un botón para borrarlo.
- yt-dlp recibe una copia temporal de las cookies en cada ejecución.
- Los argumentos de yt-dlp nunca pasan por un shell.

### Notas conocidas

- **Sin firma de código:** el instalador de Windows no está firmado con Authenticode, así que SmartScreen muestra un aviso en la primera instalación («Más información» → «Ejecutar de todas formas»).
- **Extensión descomprimida:** «ymd Cookies» se carga en modo descomprimido (modo desarrollador), así que Brave puede mostrar un aviso de extensiones en modo desarrollador al iniciar.
- **Brave, Chrome y Edge en Windows:** cifran sus cookies (app-bound), así que yt-dlp no puede leerlas directamente. Usa la extensión, Firefox o `cookies.txt`.
- **Licencias:** yt-dlp y ffmpeg (GPL) se descargan al usarse y no van incluidos en el instalador.

[0.2.0]: https://github.com/galexbh/ymd/releases/tag/v0.2.0
