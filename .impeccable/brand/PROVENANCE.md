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
| `src-tauri/icons/icon.ico`, `32x32.png` | `scripts/render-brand.mjs`, hand-built. The 16, 24 and 32 sizes are the pixel-hinted drawings on a paper tile. The 48 and 256 sizes are the app-icon tile. The ICO holds PNG entries, and the script asserts the entry sizes. |
| `src-tauri/icons/*` other than the files above | `pnpm tauri icon src-tauri/icons/app-icon.png` (mobile folders removed) |
| `src-tauri/icons/nsis-header.bmp` (150x57), `nsis-sidebar.bmp` (164x314) | `scripts/render-brand.mjs` (canvas pixels, written as 24-bit BMP) |
| `.impeccable/brand/final-render.png`, `final-render-zoom.png` | `scripts/render-brand.mjs` (size check) |
| `.impeccable/brand/proposals/*` | `scripts/proposals-gen.mjs`, `scripts/proposals-shot.mjs` |

## Regenerate

```
node .impeccable/brand/scripts/build-brand.mjs .
node .impeccable/brand/scripts/render-brand.mjs .
corepack pnpm tauri icon src-tauri/icons/app-icon.png   # then delete src-tauri/icons/android and ios
node .impeccable/brand/scripts/render-brand.mjs .       # must run after tauri icon: rebuilds icon.ico and 32x32.png, refreshes the size check
```

`Logo.tsx` is generated. Change the geometry in `build-brand.mjs`, not in the component.
