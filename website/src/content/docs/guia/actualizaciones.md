---
title: Actualizaciones
description: Cómo se actualizan ymd y yt-dlp.
---

## ymd

ymd se actualiza desde [GitHub Releases](https://github.com/galexbh/ymd/releases). Cada versión va firmada y se verifica antes de instalarse.

- Al abrir ymd, si hay una versión nueva aparece el aviso **Hay una versión nueva de ymd** con **Instalar y reiniciar** o **Más tarde**.
- En **Ajustes → Avanzado → ymd** se ven la **Versión instalada** y el botón **Buscar actualización**.

Las copias instaladas solo ven versiones publicadas. Si la búsqueda falla, vuelve a intentarlo más tarde o descarga la última versión desde la [página de releases](https://github.com/galexbh/ymd/releases/latest).

## yt-dlp

Los sitios cambian a menudo y yt-dlp se corrige igual de rápido, así que conviene tenerlo al día. En **Ajustes → Avanzado → yt-dlp**:

### Canal de actualización

| Canal   | Descripción                                                                  |
| ------- | ---------------------------------------------------------------------------- |
| Estable | Versiones probadas. Pueden tardar semanas en corregir cambios de los sitios. |
| Nightly | Recomendado: una compilación diaria con las correcciones más recientes.      |
| Master  | Cada cambio en cuanto se publica. Solo si buscas un arreglo concreto.        |

### Actualización automática

**Actualizar yt-dlp solo** revisa al abrir ymd y actualiza cuando no hay descargas en curso. yt-dlp no se puede cambiar mientras haya descargas en curso o en cola.

También puedes actualizar a mano desde [Dependencias](/ymd/dependencias/) con **Buscar actualizaciones**. Si la copia de yt-dlp del sistema está desactualizada, ymd ofrece instalar la suya, que tendrá prioridad; el archivo del sistema no se toca.
