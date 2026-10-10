## Qué cambia / What changes

<!-- Una o dos frases. Enlaza el issue si existe. -->

## Checklist

- [ ] Tests añadidos o actualizados para este cambio (Rust, Vitest y/o Playwright) — _tests added/updated_
- [ ] `pnpm check` y `pnpm test:rust` en verde localmente — _green locally_
- [ ] Si cambia el contrato IPC: `model.rs` + `types.ts` + `commands.ts`/`events.ts` + mock (`src/ipc/mock`) + tests en el mismo commit
- [ ] UI revisada en tema **claro y oscuro** (solo tokens, sin hex sueltos) — _both themes checked_
- [ ] Textos nuevos en **es y en** con las mismas claves — _es/en strings_
- [ ] Sin secretos en disco, argv ni logs; yt-dlp siempre por argv, nunca por shell

## Capturas / Screenshots

<!-- Para cambios visuales: antes / después, claro y oscuro. -->
