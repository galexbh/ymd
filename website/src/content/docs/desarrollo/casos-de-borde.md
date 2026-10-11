---
title: Casos de borde
description: Problemas reales resueltos durante el desarrollo de ymd, con su causa, su solución y la ubicación del código.
---

Fallos reales encontrados durante el desarrollo de ymd, su causa y dónde está la solución. Cada caso sigue el orden **Síntoma → Causa → Solución → Dónde está**.

## Edge aparecía «abierto» sin ninguna ventana

- **Síntoma:** al leer las cookies de Edge, ymd pedía cerrarlo aunque no hubiera ninguna ventana abierta.
- **Causa:** el «Inicio rápido» de Edge deja el navegador en segundo plano, y la base de cookies sigue bloqueada mientras tanto.
- **Solución:** ymd no lee directamente los navegadores Chromium: sus cookies llegan a través de la extensión (**Extensión** en **Origen de las cookies**).
- **Dónde está:** `src/screens/settings/AccountsSettings.tsx`.

## yt-dlp no descifra las cookies de Chrome en Windows

- **Síntoma:** con Chrome, Brave o Edge en Windows, yt-dlp falla al descifrar las cookies («Failed to decrypt with DPAPI»).
- **Causa:** el cifrado app-bound de Chromium solo deja descifrar las cookies al propio navegador.
- **Solución:** la extensión ymd Cookies lee las cookies desde dentro del navegador y se las pasa a ymd por Native Messaging, sin red. Ver [Protocolo del puente de cookies](/ymd/desarrollo/puente-de-cookies/).
- **Dónde está:** `src-tauri/src/auth/native_host.rs`, `extension/src/lib/sync.ts`.

## yt-dlp sobrescribía las cookies recién sincronizadas

- **Síntoma:** después de una descarga, las cookies que la extensión acababa de enviar volvían a una versión vieja.
- **Causa:** yt-dlp reescribe al salir el archivo que recibe en `--cookies`, con lo que tenía en memoria al empezar.
- **Solución:** cada descarga recibe una copia propia del archivo de cookies dentro de su carpeta temporal, que se borra con ella.
- **Dónde está:** `ephemeral_copy` y `ephemeral_args` en `src-tauri/src/auth/cookies.rs`, usados desde `src-tauri/src/jobs.rs`.

## Cookies guardadas en texto plano

- **Síntoma:** el archivo de cookies que llega por la extensión quedaba legible para cualquier programa del usuario.
- **Causa:** guardarlo tal cual deshacía la protección que Chromium da a sus propias cookies.
- **Solución:** el archivo se sella con ChaCha20-Poly1305 y una clave aleatoria guardada en el llavero del sistema. Si no hay llavero (Linux sin Secret Service), queda como archivo legible solo por su dueño y el registro lo avisa.
- **Dónde está:** `src-tauri/src/auth/jar.rs`.

## El navegador nunca cerraba el canal con ymd

- **Síntoma:** tras **Descargar con ymd**, el navegador se quedaba esperando a que el puente cerrara un canal que nunca se cerraba.
- **Causa:** en Windows, el ymd que abre el puente heredaba la entrada y salida estándar del puente (los canales del navegador), así que el navegador nunca veía cerrarse el canal.
- **Solución:** antes de lanzar ymd, el puente marca esos handles como no heredables con `SetHandleInformation`.
- **Dónde está:** `src-tauri/src/open_url.rs`.

## Se perdía el enlace al abrir ymd desde el navegador

- **Síntoma:** con ymd cerrado, **Descargar con ymd** abría la app pero **Recibir** quedaba vacío (en desarrollo).
- **Causa:** el enlace se toma del backend una sola vez, y en desarrollo React StrictMode monta, desmonta y vuelve a montar los efectos: el primer montaje lo tomaba y lo perdía al desmontarse.
- **Solución:** el enlace tomado espera a nivel de módulo y lo entrega el montaje que siga vivo, cuando la configuración inicial ya terminó.
- **Dónde está:** `src/store/clipboard.ts`.

## El menú contextual no aparecía sobre el video de YouTube

- **Síntoma:** **Descargar con ymd** salía en enlaces y en la página, pero no al hacer clic derecho sobre el reproductor de YouTube.
- **Causa:** Chrome compara `targetUrlPatterns` con el `srcUrl` del video, que en YouTube es una URL `blob:`, y la entrada desaparecía.
- **Solución:** la entrada solo usa `documentUrlPatterns`, y `clickedLink` elige el enlace correcto: el del enlace pulsado, la selección o la página, descartando lo que no sea web.
- **Dónde está:** `extension/src/lib/sync.ts`, `extension/src/lib/links.ts`.

## Las extensiones desempaquetadas no se actualizan automáticamente

- **Síntoma:** al actualizar ymd, la extensión cargada en el navegador seguía en su versión anterior.
- **Causa:** una extensión cargada como desempaquetada no recibe actualizaciones automáticas; hay que recargarla a mano.
- **Solución:** la extensión envía su versión en cada sincronización. Si la que trae ymd es más nueva, la tarjeta de la extensión pide abrir las extensiones del navegador y pulsar recargar en ymd Cookies.
- **Dónde está:** `src/screens/settings/ExtensionCard.tsx`, `extensionOutdated` en `src/screens/settings/extension.ts`.

## YouTube pide «confirmar que no eres un bot» en CI

- **Síntoma:** la prueba nocturna con YouTube real fallaba en los runners de GitHub sin que nada hubiera cambiado en ymd.
- **Causa:** YouTube a veces marca las IP de los runners y responde «Sign in to confirm you're not a bot».
- **Solución:** esa respuesta se reporta como aviso (`::warning`) y se saltan las comprobaciones de descarga; cualquier otro fallo sigue rompiendo el job.
- **Dónde está:** `.github/workflows/nightly-smoke.yml`.

## Reanudar descargas sin guardar secretos

- **Síntoma:** al cerrar ymd con descargas a medias, se perdían; guardarlas tal cual habría dejado contraseñas de video o códigos 2FA en disco.
- **Causa:** el trabajo vivía solo en memoria, y su archivo parcial dependía de una carpeta temporal por trabajo.
- **Solución:** la tabla `pending_jobs` guarda cada trabajo sin terminar con su mismo id, así **Reanudar** reutiliza `tmp/<id>` y yt-dlp sigue desde sus `.part`. Las que usaron un secreto solo guardan `needs_secret` y no se reanudan automáticamente.
- **Dónde está:** `src-tauri/src/jobs.rs`, `src-tauri/src/history.rs`.

## El minificador de producción rechazaba un selector CSS

- **Síntoma:** la animación de apertura de las listas desplegables funcionaba en desarrollo, pero no pasaba por el minificador de CSS de producción.
- **Causa:** el minificador de CSS no acepta `::picker(select):popover-open`.
- **Solución:** el estado abierto se escribe con `:open` sobre el `select` (`.select:open::picker(select)`).
- **Dónde está:** `src/ui/Field.module.css`.
