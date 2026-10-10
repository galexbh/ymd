# Diagramas de la documentación

Fuentes de los diagramas de [Archify](https://github.com/tt-a1i/archify) que se publican en `website/public/diagramas/` y se incrustan en las páginas de `desarrollo/`. Cada JSON cita, con ruta y línea, el código que respalda cada nodo, en la revisión de `meta.repository.revision`.

| Fuente                       | Publicado en                                  | Página                               |
| ---------------------------- | --------------------------------------------- | ------------------------------------ |
| `puente-de-cookies.es.json`  | `public/diagramas/puente-de-cookies.html`     | `desarrollo/puente-de-cookies.md`    |
| `arquitectura.es.json`       | `public/diagramas/arquitectura.html`          | `desarrollo/arquitectura.md`         |
| `ciclo-de-descarga.es.json`  | `public/diagramas/ciclo-de-descarga.html`     | `desarrollo/arquitectura.md`         |
| `cookie-bridge.en.json`      | `public/diagramas/en/cookie-bridge.html`      | `en/desarrollo/puente-de-cookies.md` |
| `architecture.en.json`       | `public/diagramas/en/architecture.html`       | `en/desarrollo/arquitectura.md`      |
| `download-lifecycle.en.json` | `public/diagramas/en/download-lifecycle.html` | `en/desarrollo/arquitectura.md`      |

## Actualizar un diagrama

1. Edita el JSON. Si el código cambió, actualiza las líneas citadas y `meta.repository.revision` (un commit sin cambios locales).
2. Genera y valida el HTML:

   ```sh
   node <archify>/bin/archify.mjs finalize <tipo> website/diagrams/<nombre>.json <salida>.html --repo-root . --quality showcase
   ```

3. Copia el HTML a `website/public/diagramas/` con el nombre de la tabla y revisa la página en tema claro y oscuro.

En las páginas, el diagrama va en `<figure class="archify-figure">` con un `<iframe data-archify="…">`. `public/diagramas/embed.js` le aplica el tema del sitio y ajusta su altura. Esas páginas llevan `tableOfContents: false` para que el diagrama use todo el ancho.
