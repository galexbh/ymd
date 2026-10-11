---
title: Actualizaciones
description: Cómo se actualizan ymd y yt-dlp.
---

## ymd

ymd se actualiza desde [GitHub Releases](https://github.com/galexbh/ymd/releases). Cada versión va firmada y se verifica antes de instalarse.

- ymd busca versiones nuevas al abrirse y cada 6 horas mientras sigue abierto.
- Si encuentra una, aparece el aviso **Hay una versión nueva de ymd** con **Instalar y reiniciar** y **Ver novedades**. El aviso se queda hasta que lo cierras.
- Si ymd está en segundo plano, también recibes una notificación del sistema, una sola vez por versión.
- En **Ajustes → Avanzado → ymd** se ven la **Versión instalada**, el botón **Buscar actualización** y, cuando hay una versión nueva, sus novedades.

Si la búsqueda falla, vuelve a intentarlo más tarde o descarga la última versión desde la [página de releases](https://github.com/galexbh/ymd/releases/latest).

## yt-dlp

Los sitios cambian a menudo y yt-dlp publica correcciones con frecuencia, así que se recomienda mantenerlo actualizado. En **Ajustes → Avanzado → yt-dlp**:

### Canal de actualización

| Canal   | Descripción                                                                  |
| ------- | ---------------------------------------------------------------------------- |
| Estable | Versiones probadas. Pueden tardar semanas en corregir cambios de los sitios. |
| Nightly | Recomendado: una compilación diaria con las correcciones más recientes.      |
| Master  | Cada cambio en cuanto se publica. Solo si buscas un arreglo concreto.        |

### Actualización automática

**Actualizar yt-dlp automáticamente** revisa al abrir ymd y actualiza cuando no hay descargas en curso. yt-dlp no se puede actualizar mientras haya descargas en curso o en cola.

También puedes actualizar manualmente desde [Dependencias](/ymd/dependencias/) con **Buscar actualizaciones**. Si la copia de yt-dlp del sistema está desactualizada, ymd ofrece instalar la suya, que tendrá prioridad; el archivo del sistema no se toca.
