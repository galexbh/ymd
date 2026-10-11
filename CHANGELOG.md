# Changelog

Todas las versiones notables de ymd. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); las versiones siguen [SemVer](https://semver.org/lang/es/).

## [Unreleased]

### Cambios

- **Tramo** se pliega como **Opciones de esta descarga**: está cerrado de inicio, muestra el tramo elegido junto al título («Tramo · 1:30–2:45») y queda abierto mientras el tramo no sea válido.

## [0.8.0] - 2026-10-11

### Novedades

- **Ajustes del audio en los preajustes.** Los preajustes de audio suman tres opciones, apagadas de inicio: **Separar artista y título** (un título «Artista - Canción» se guarda en las etiquetas de artista y de título), **Carátula cuadrada** (recorta la miniatura incrustada por el centro) e **Igualar volumen** (normaliza a -14 LUFS al convertir; no disponible con el formato **Original**). Están en **Ajustes → Preajustes**.
- **Descargar solo un tramo de un video.** La ficha de **Recibir** tiene el bloque **Tramo** con **Desde** y **Hasta** (`90`, `1:30` o `1:02:03`). ffmpeg vuelve a codificar alrededor de los cortes para que el archivo empiece y termine justo ahí; el nombre lleva el tramo al final (`[1.30-2.45]`) y la fila del registro lo muestra. No se ofrece para listas.

### Cambios

- **Carpeta del preajuste** vacía muestra la carpeta que se usará en su lugar (la de videos o de música de **Ajustes → Descargas**, según el tipo).

### Proyecto

- El release compila con `--locked`: usa exactamente las versiones de `Cargo.lock`, igual que la CI.
- El test que vacía los registros al salir ya no depende de la velocidad del runner (fallaba a veces en macOS).

## [0.7.0] - 2026-10-11

### Novedades

- **Node.js reemplaza a Deno como entorno JavaScript gestionado.** [Deno pasó a Cloudflare](https://blog.cloudflare.com/deno-joins-cloudflare/) y su entorno solo recibirá un año más de correcciones, así que ymd instala ahora la última versión LTS de Node.js (22 o posterior) desde nodejs.org, verificada con `SHASUMS256.txt`. Si no hay otro entorno, **Dependencias** ofrece **Instalar Node.js**. Un Node, Deno, Bun o QuickJS del sistema se sigue usando.

### Cambios

- **Ventana de la extensión más limpia.** El campo para escribir un sitio queda plegado tras **+ Otro sitio…**: los sitios conocidos se agregan con **Sitios sugeridos** o **Usar mi sesión de …**. Extensión 1.4.2.
- El interruptor «Actualizar yt-dlp solo» se llama ahora **Actualizar yt-dlp automáticamente** (**Ajustes → Avanzado → yt-dlp**).

### Correcciones

- **Menos trabajo con muchas descargas o con ymd en la bandeja.** La interfaz ya no se vuelve a dibujar entera con cada avance de descarga: solo cambia la fila de esa descarga, y la cuadrícula de una playlist en **Recibir** no se toca. Con la ventana oculta, el avance se aplica cada 2 s (los finales y errores siguen llegando al instante, igual que los avisos), la tarjeta de la extensión deja de consultar su estado y el **Catálogo** se actualiza al abrirlo en lugar de una vez por descarga terminada.
- ymd ya no acumula memoria con el tiempo: libera la actualización encontrada al volver a buscar, los errores de filas ya quitadas y los temporizadores de avisos cerrados antes de tiempo.
- **ymd en la bandeja ya no acumula descargas terminadas ni archivos temporales.** El **Registro** guarda las 200 descargas terminadas más recientes y quita solas las más antiguas; cada 30 minutos se borran las carpetas temporales y las copias de cookies que nadie usa, y al abrir ymd también los restos de una sincronización o una instalación interrumpidas. Las descargas sin terminar que nadie reanuda en 14 días se olvidan con sus archivos parciales.
- La contraseña del video y el código 2FA se olvidan en cuanto termina la descarga: **Reintentar** pide volver a pegar el enlace en **Recibir**.
- La limpieza de registros y la actualización diaria de yt-dlp siguen el reloj real: ya no se atrasan días cuando el equipo duerme.
- Una línea de progreso sin fin de yt-dlp o ffmpeg ya no hace crecer la memoria, y el detalle de un error se recorta a 2 KB.
- Un análisis de enlace que no responde en 60 s cierra yt-dlp y los procesos que haya abierto. Las consultas al sistema (navegador predeterminado, procesos abiertos) tienen un límite de 5 s.
- Un fallo interno durante una descarga la marca como fallida y libera su lugar en la cola, en vez de bloquearla.
- Dos navegadores que sincronizan cookies a la vez ya no mezclan el archivo de cookies con los datos de otro envío, y el puente responde con un error si una petición tarda más de 20 s.
- ymd busca entornos JavaScript una vez cada 10 minutos (o al instalar o quitar uno), no en cada descarga.
- Las últimas líneas del registro local se escriben antes de salir.
- **Extensión: sin reenvíos en bucle tras un error.** Si un envío falla, la extensión ya no reenvía las cookies con cada cambio: reintenta con la sincronización de cada 30 min, con espera creciente (30 min, 1 h, 2 h… hasta 6 h) si ymd rechazó el envío o no respondió. **Enviar ahora** sigue intentándolo en el momento. Extensión 1.4.4.
- **Extensión: un ymd que no responde ya no bloquea los envíos.** Cada mensaje al puente espera 30 s como máximo, y solo queda en cola un envío pendiente.
- **Extensión: más de 10.000 cookies se avisa sin enviar.** La ventana explica el motivo y el icono muestra **!** en rojo, igual que cuando ymd no pudo guardar las cookies.
- **Extensión: menos trabajo por cambio de cookie.** La lista de sitios se lee de memoria, un flujo continuo de cambios se envía como máximo 30 s después del primero, un envío pendiente se completa aunque el navegador haya suspendido la extensión, y la página de bienvenida deja de comprobar el anclaje una vez fijada.

### Proyecto

- Se eliminó el código de migración de versiones anteriores (ajustes, cookies, extensión y protocolo del puente); el protocolo exige ahora `version` y `extension`. Extensión 1.4.3.
- Documentación revisada: tono profesional y sin notas internas.
- README y portada de la documentación presentan ymd por lo que resuelve («Pega un enlace y guarda el video…»), con una sección «Qué resuelve este proyecto» y la nueva página [Casos de borde](https://galexbh.github.io/ymd/desarrollo/casos-de-borde/): once problemas reales con su síntoma, causa, arreglo y código.

## [0.6.0] - 2026-10-11

### Novedades

- **Varios enlaces a la vez.** Pegar en **Recibir** un texto con dos o más enlaces abre el panel **Varios enlaces**: lista los enlaces (sin repetidos, hasta 200), marca como **Excluido** lo que no es un enlace y los encola todos con el preajuste del mostrador. La carpeta se pregunta una sola vez y **Playlists completas** decide si un enlace de lista baja la lista entera o solo el video. <kbd>Enter</kbd> encola y <kbd>Esc</kbd> cancela.
- **Límite de velocidad.** **Ajustes → Descargas → Límite de velocidad** pone un tope por descarga: **Sin límite**, 1, 2, 5, 10, 20 o 50 MB/s, u **Otro…** para escribir de 1 a 1000. Se aplica a las descargas que empiecen a partir de ese momento (yt-dlp `--limit-rate`, y también aria2c cuando está activado).
- **Programar el inicio de la cola.** En **Registro**, **Programar inicio** deja lo que esté en cola esperando hasta una hora (hoy, o mañana si ya pasó). Un aviso muestra «La cola empieza a las HH:MM» con **Empezar ahora**. La hora no se guarda al salir de ymd.
- **Las descargas ya no se pierden al cerrar ymd.** Si ymd se cierra con descargas en curso o en cola (con **Salir**, al apagar el equipo o tras un cierre inesperado), el **Registro** muestra «Hay N descargas sin terminar» al volver: **Reanudar** las devuelve a la cola con su mismo número y yt-dlp sigue desde donde iba; **Descartar** las olvida y borra los archivos parciales. Nada se reanuda solo. Las que usaron contraseña del video o código 2FA aparecen aparte para pegarlas de nuevo en **Recibir**: esos datos nunca se guardan.
- **Avisos con criterio.** La notificación del sistema llega solo si ymd está en segundo plano, agrupa las descargas que terminan juntas («3 descargas terminadas») y, si una falla, dice cuál y por qué; al volver a ymd se abre el **Registro**. Se apaga en **Ajustes → Descargas → Avisar cuando termine una descarga**.
- **Exportar diagnóstico.** En **Ajustes → Avanzado**, **Exportar diagnóstico** guarda un zip para adjuntar a un issue: versiones de ymd y de las herramientas, sistema, un resumen de los ajustes sin carpetas, los registros de los últimos 14 días y cuánto tardó cada etapa de las últimas descargas. No incluye cookies, contraseñas, el historial ni el archivo de ajustes. Al guardarlo, el aviso trae **Mostrar en la carpeta**.
- **Registros locales.** ymd anota en su carpeta de datos (`logs`, un archivo por día) cuánto tarda cada etapa de una descarga, cómo termina y su código de error, las actualizaciones de herramientas y las sincronizaciones de la extensión (solo cuántas cookies). Antes de escribir, borra enlaces con parámetros, rutas de tu carpeta personal, contraseñas y tokens; los archivos se borran solos a los 14 días y nunca salen de tu computadora.

### Cambios

- **Listas desplegables con el estilo de ymd.** En Windows, al abrir un selector (por ejemplo **Preajuste** en **Recibir**), la lista usa los colores, la tipografía y el check de la app en lugar de la lista gris del sistema. En macOS y Linux sigue la lista del sistema.
- **«Ninguno» ahora se llama «Sin sesión»** en **Origen de las cookies**, con una pista que explica para qué sirve: descargar como si no hubieras iniciado sesión.

### Correcciones

- **Abrir carpeta de datos** abre la carpeta donde ymd guarda de verdad sus datos (en Windows, `%APPDATA%\com.ymd.app`), no una carpeta vacía en `%LOCALAPPDATA%`.

### Proyecto

- Oxlint y oxfmt reemplazan a ESLint y Prettier: mismas reglas (incluidas las de hooks y React Compiler) y el mismo estilo, con `pnpm lint` y `pnpm format:check` varias veces más rápidos. La configuración vive en `.oxlintrc.json` y `.oxfmtrc.json`; en VS Code se recomienda la extensión Oxc.
- CI más rápida y barata: la cobertura de Rust sale del job `rust` en Linux (sin un job aparte que recompilaba todo), `build-check` corre solo en Linux con su propia caché y sin repetir `tsc`, los push a `main` ya no se cancelan entre sí y cargo usa `--locked`. El nuevo `warm-release-cache.yml` prepara en `main` la caché de Rust que lee `release.yml`, y `cache-cleanup.yml` borra a diario las cachés viejas de `main` para no pasar de los 10 GB.

## [0.5.1] - 2026-10-10

### Novedades

- **ymd se queda en la bandeja del sistema.** Al pulsar la X, la ventana se oculta junto al reloj (en macOS, en la barra de menús): las descargas siguen y **Descargar con ymd** responde al instante. El icono abre ymd con un clic y su menú trae **Abrir ymd** y **Salir**. La primera vez lo avisa una notificación. Para que la X cierre ymd, apaga **Ajustes → Avanzado → Al cerrar la ventana → Mantener ymd en la bandeja del sistema**.
- **Versión de la extensión.** La tarjeta de la extensión en **Ajustes → Cuentas** muestra qué versión de «ymd Cookies» sincroniza y avisa cuando ymd trae una más nueva: una extensión descomprimida no se actualiza sola, así que basta con pulsar recargar en la página de extensiones del navegador.

### Cambios

- **«Descargar con ymd» en más sitios.** El clic derecho ahora funciona sobre el video de YouTube, un texto seleccionado que sea un enlace y los reproductores incrustados en otras páginas, además de enlaces y la página. Nuevo atajo **Alt+Shift+Y** para enviar la pestaña abierta (se cambia en `brave://extensions/shortcuts`). Extensión 1.4.1.
- **Ventana de la extensión más compacta.** Se quitó el botón **Descargar con ymd** (lo hacen el clic derecho y el atajo); **Esta página** solo aparece cuando puede ofrecer **Usar mi sesión de …**; y con más de cinco sitios, **Sitios permitidos** se pliega tras **Mostrar todos**.
- **Pie de la barra lateral más simple.** Se quitó la fila **Entorno JS** (el entorno sigue en **Dependencias**) y se agregó un enlace a **galexbh.dev**, el sitio del autor.

## [0.5.0] - 2026-10-10

### Novedades

- **Página de bienvenida de la extensión.** Al instalar «ymd Cookies» se abre una página que guía para fijarla en la barra (y confirma cuando queda fijada) y para elegir sitios. Extensión 1.4.0.
- **Sitios sugeridos.** La ventana de la extensión ofrece YouTube, Vimeo, SoundCloud y Twitch para agregarlos con un clic, y **Permitir** en un sitio que perdió su permiso.

### Seguridad

- **Se quitó la importación manual de `cookies.txt`.** Un archivo exportado a mano guarda todas tus sesiones en texto plano, fuera de la protección del navegador. **Origen de las cookies** queda con **Ninguno**, **Extensión** y **Firefox**, y también desaparece **Importar desde el navegador ahora**. Si usabas un archivo importado, el origen pasa a **Ninguno** y ymd borra esa copia al arrancar. Usa la extensión o Firefox.

### Cambios

- **YouTube sigue listo sin pasos en la extensión que trae ymd.** La versión para la Chrome Web Store no trae ningún sitio de serie: su bienvenida ofrece **Usar YouTube**, y el navegador pide permiso para cada sitio que agregas. En **Ajustes → Cuentas**, **Sesión de YouTube** dice **Sin agregar** cuando la extensión no envía YouTube.

### Proyecto

- ymd acepta el ID que la Chrome Web Store asignó a «ymd Cookies» (`hhojlkpllmndkaolmebblijfcjkjpdpi`), además del de la versión descomprimida, para que ambas puedan hablar con ymd. La instalación automática desde el instalador de ymd sigue apagada hasta que la tienda publique la extensión.

## [0.4.0] - 2026-10-10

### Novedades

- **Descargar con ymd desde el navegador.** Clic derecho en un enlace, un video o la página → **Descargar con ymd**, o el botón **Descargar con ymd** en la ventana de la extensión (**Esta página**). ymd se abre, o pasa al frente si ya estaba abierto, con el enlace en **Recibir** y su ficha. Si el mostrador tenía otro enlace, te pregunta antes de cambiarlo, y nada se descarga sin tu clic. Extensión «ymd Cookies» 1.3.0.
- **Estado de la sesión de YouTube.** La ventana de la extensión y **Ajustes → Cuentas** dicen si la copia de cookies tiene tu sesión de YouTube (**Activa** o **Cerrada**), y el icono de la extensión muestra **!** cuando la sesión se cerró o no puede hablar con ymd. Se decide por el nombre de las cookies, nunca por su contenido.
- **Agregar el sitio actual.** En un sitio que ymd conoce (Vimeo, SoundCloud, Twitch…), la ventana de la extensión ofrece **Usar mi sesión de …** para agregarlo a la lista con un clic, sin escribir el dominio.

### Seguridad

- **Cookies cifradas en disco.** La copia de cookies de ymd se guarda cifrada (ChaCha20-Poly1305) con una clave aleatoria en el llavero del sistema, para que conserve la misma protección que el navegador da a tus sesiones. Las copias existentes se cifran solas la primera vez que ymd las lee. El texto plano solo existe durante una descarga, en la copia que recibe yt-dlp, y ymd borra al arrancar las que haya dejado un cierre forzado.
- **Extensión «ymd Cookies» más cerrada.** No acepta mensajes de otras extensiones ni de páginas web, solo responde a su propio popup, usa una política de contenido estricta (solo sus archivos, sin conexiones de red) y rechaza dominios compartidos por muchos sitios (`co.uk`, `github.io`…), que darían acceso a sitios ajenos.
- **Host nativo más estricto.** Como máximo 10.000 cookies por mensaje, y cada cookie con un dominio y una ruta válidos, sin caracteres de control y de 4096 bytes como máximo. El host sigue sin devolver nunca cookies.

### Cambios

- **Brave, Chrome, Edge y demás navegadores Chromium solo con la extensión.** **Origen de las cookies** ahora ofrece **Ninguno**, **Extensión**, **Firefox** (o **Firefox o Safari** en macOS) y **Archivo cookies.txt**. ymd ya no intenta leer directamente los navegadores Chromium: en Windows sus cookies están cifradas, y quedan bloqueadas mientras el navegador sigue en segundo plano (por ejemplo, el «Inicio rápido» de Edge), así que aparecían como «abiertos» sin ninguna ventana. Si tenías elegido uno, ymd pasa a **Extensión** solo.

### Proyecto

- Preparación para publicar «ymd Cookies» en la Chrome Web Store: paquete sin `key` (`pnpm ext:zip:store`, también en cada release), capturas para la ficha (`pnpm ext:shots`), [política de privacidad pública](https://galexbh.github.io/ymd/cookies/privacidad-extension/) y ymd preparado para aceptar el ID que asigne la tienda.

## [0.3.1] - 2026-10-10

### Novedades

- **Aviso de versiones nuevas**: ymd busca actualizaciones al abrirse y cada 6 horas. Si está en segundo plano, también envía una notificación del sistema, una sola vez por versión. El aviso incluye **Ver novedades**.
- **Novedades con formato**: las notas de una versión nueva se muestran con títulos, listas y enlaces, en lugar del Markdown sin procesar.

### Cambios

- **La extensión «ymd Cookies» solo lee YouTube por defecto** (versión 1.1.0). Ya no incluye `google.com`: la sesión de YouTube vive en sus propias cookies, así que no hace falta tocar las de tu cuenta de Google. Al actualizarse la quita de la lista una vez; si la necesitas para otro sitio, puedes volver a agregarla.
- **«Mostrar la carpeta de la extensión»** abre el Explorador con la carpeta `extension` seleccionada, lista para arrastrarla a la página de extensiones.
- Ajustes → Cuentas menciona yt-dlp solo donde importa: su lista de sitios y su página de soporte.

### Proyecto

- Diagramas en la documentación de desarrollo: el puente de cookies, la arquitectura y el ciclo de una descarga.
- Node 24 (LTS) en CI y como requisito para desarrollar; dependencias de npm con versión exacta.
- GitHub Actions actualizadas, incluida `tauri-action` v1.

## [0.3.0] - 2026-10-10

### Novedades

- **Preajuste M4A (AAC)** entre los que vienen por defecto: audio en contenedor m4a que, con YouTube, suele guardarse sin recodificar.
- **La extensión «ymd Cookies» funciona en cualquier navegador Chromium**: Brave, Chrome, Edge, Vivaldi, Opera, Opera GX, Arc, Yandex, Whale, Thorium y otros.
- **Detección del navegador predeterminado**: la tarjeta de la extensión en Ajustes → Cuentas muestra los pasos para tu navegador. Si es Firefox, te ofrece usar sus cookies directamente.
- **Abrir la página de extensiones**: el botón abre tu navegador y copia la dirección (`brave://extensions`, `opera://extensions`…) para pegarla. Los navegadores no dejan que otro programa abra esa página por sí mismo.
- **Sitio de documentación** en español e inglés: https://galexbh.github.io/ymd/

### Correcciones

- «Abrir carpeta de la extensión» no hacía nada; ahora abre la carpeta y, si falla, muestra la ruta.

### Proyecto

- Licencia MIT.
- CI más rápido: cada cambio ejecuta solo lo que afecta; en `main` se ejecuta todo.

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

[Unreleased]: https://github.com/galexbh/ymd/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/galexbh/ymd/releases/tag/v0.8.0
[0.7.0]: https://github.com/galexbh/ymd/releases/tag/v0.7.0
[0.6.0]: https://github.com/galexbh/ymd/releases/tag/v0.6.0
[0.5.1]: https://github.com/galexbh/ymd/releases/tag/v0.5.1
[0.5.0]: https://github.com/galexbh/ymd/releases/tag/v0.5.0
[0.4.0]: https://github.com/galexbh/ymd/releases/tag/v0.4.0
[0.3.1]: https://github.com/galexbh/ymd/releases/tag/v0.3.1
[0.3.0]: https://github.com/galexbh/ymd/releases/tag/v0.3.0
[0.2.0]: https://github.com/galexbh/ymd/releases/tag/v0.2.0
