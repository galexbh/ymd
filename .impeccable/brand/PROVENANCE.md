# Brand asset provenance

All ymd brand marks are hand-authored SVG geometry, written as coordinates in scripts. No image generation, no fonts, no third-party marks.

## Chosen mark

Proposal A, "Sello de entrada": a double-ruled accession stamp holding a lowercase y. The y has V-shaped arms, and its tail cuts through both rules. The wordmark "ymd" is drawn as filled outlines: monoline, stem 6, x-height 24, with 1-unit overshoot on the m arches and the d bowl. Its y has the same straight, stamp-cut tail as the mark's y.

## Sources

| Asset | Origin |
|---|---|
| `src/assets/brand/isotype.svg` (64 master), `isotype-24.svg`, `isotype-16.svg` (pixel-hinted) | `scripts/build-brand.mjs` |
| `src/assets/brand/logotype.svg`, `src/assets/brand/Logo.tsx` | `scripts/build-brand.mjs` |
| `public/favicon.svg` (16 hint, violet, dark-scheme variant) | `scripts/build-brand.mjs` |
| `.impeccable/brand/appicon.svg` (1024, macOS 824 safe area) | `scripts/build-brand.mjs` |
| `src-tauri/icons/app-icon.png` | `scripts/render-brand.mjs` (Playwright Chromium rasterizes `appicon.svg`) |
| `src-tauri/icons/*` other than the two BMPs and `app-icon.png` | `pnpm tauri icon src-tauri/icons/app-icon.png` (mobile folders removed) |
| `src-tauri/icons/nsis-header.bmp` (150x57), `nsis-sidebar.bmp` (164x314) | `scripts/render-brand.mjs` (canvas pixels, written as 24-bit BMP) |
| `.impeccable/brand/final-render.png`, `final-render-zoom.png` | `scripts/render-brand.mjs` (size check) |
| `.impeccable/brand/proposals/*` | `scripts/proposals-gen.mjs`, `scripts/proposals-shot.mjs` |

## Regenerate

```
node .impeccable/brand/scripts/build-brand.mjs .
node .impeccable/brand/scripts/render-brand.mjs .
corepack pnpm tauri icon src-tauri/icons/app-icon.png   # then delete src-tauri/icons/android and ios
node .impeccable/brand/scripts/render-brand.mjs .       # refresh the size check with the new 32x32.png
```

`Logo.tsx` is generated. Change the geometry in `build-brand.mjs`, not in the component.
