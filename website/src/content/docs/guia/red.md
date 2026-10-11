---
title: Red
description: Proxy, versión de IP, tiempo de espera, reintentos y límite de velocidad de las descargas.
---

**Ajustes → Red** reúne las opciones de conexión que ymd le pasa a yt-dlp. Se aplican a las descargas, al análisis de enlaces en **Recibir** y a **Probar cookies** en **Ajustes → Cuentas**. Los cambios valen para lo que empiece después de guardarlos; una descarga en curso sigue con las opciones con las que empezó.

## Proxy

En **Dirección del proxy** escribe la dirección completa, por ejemplo `socks5://127.0.0.1:1080` o `http://proxy.ejemplo.com:3128`. Se aceptan los esquemas `http`, `https`, `socks4`, `socks4a`, `socks5` y `socks5h`, seguidos del servidor (nombre, IPv4 o IPv6 entre corchetes) y, si hace falta, el puerto.

- La dirección se guarda al salir del campo o al pulsar <kbd>Enter</kbd>, y solo si es válida. Mientras tenga un error, se conserva la última dirección válida.
- Para dejar de usar el proxy, borra el campo.
- Sin proxy en ymd, yt-dlp se conecta como lo haría por su cuenta; por ejemplo, respeta las variables de entorno `HTTP_PROXY` y `HTTPS_PROXY` si están definidas.

:::caution[El proxy ve tu tráfico]
El proxy sabe a qué sitios te conectas y cuándo. Usa uno de confianza, como uno propio o el de tu organización.
:::

### Sin usuario ni contraseña

ymd no acepta una dirección con usuario o contraseña (`http://usuario:clave@servidor:8080`) y lo avisa en el campo. La razón: esa dirección tendría que guardarse en el archivo de ajustes en texto plano y pasarse a yt-dlp como argumento, donde otros programas del equipo pueden leerla. ymd no guarda secretos en disco ni en los argumentos de los procesos.

Si tu proxy exige autenticación, usa uno que autorice por dirección IP o un proxy local sin contraseña que reenvíe al tuyo.

### socks5 o socks5h

Con `socks5://` (y `socks4://`), tu equipo resuelve el nombre del sitio con tu servidor DNS habitual, que ve a qué sitios te conectas aunque el tráfico vaya por el proxy. Con `socks5h://` (y `socks4a://`), el proxy resuelve los nombres. Si quieres que tu red local no vea los nombres de los sitios, usa `socks5h://`.

## Conexión

- **Versión de IP**: **Automática** (lo predeterminado) deja que yt-dlp use la que responda. **Solo IPv4** ayuda cuando la conexión IPv6 falla o un sitio la bloquea. **Solo IPv6** sirve solo si tu red tiene IPv6.
- **Tiempo de espera**: cuánto esperar a que el servidor responda antes de dar la conexión por perdida: **Predeterminado de yt-dlp** (hoy, 20 s), 10, 20, 30 o 60 s.
- **Reintentos**: cuántas veces repetir una descarga o un fragmento que falla: **Predeterminado de yt-dlp** (hoy, 10), 3, 10, 20 o 50.

Con un proxy que no responde, un tiempo de espera corto y pocos reintentos hacen que el error aparezca antes. ymd lo muestra como [Se perdió la conexión](/ymd/solucion-de-problemas/#se-perdió-la-conexión).

## Velocidad

**Límite de velocidad**: **Sin límite** (lo predeterminado), 1, 2, 5, 10, 20 o 50 MB/s, u **Otro…** para escribir un número entero entre 1 y 1000. Cada descarga respeta ese tope por separado, y con aria2c también se aplica a aria2c. El límite se aplica a las descargas que empiecen después de guardarlo; las que ya están en curso mantienen la velocidad con la que empezaron.

## Lo que no pasa por estos ajustes

La búsqueda de actualizaciones de ymd y la descarga de sus herramientas (yt-dlp, ffmpeg, Node.js y las demás de **Dependencias**) no usan el proxy de **Ajustes → Red**. Siguen el proxy del sistema definido en las variables de entorno `HTTP_PROXY` y `HTTPS_PROXY`.

Ningún ajuste de esta sección desactiva la verificación de certificados TLS.
