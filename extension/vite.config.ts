/// <reference types="vitest/config" />
// Builds the ymd Cookies extension into extension/dist and runs its unit tests.
//
// Two entries: popup.html (→ popup.html + popup.js + popup.css) and the service worker
// (→ background.js, an ES module). The manifest, locales and icons are copied verbatim.
// No inline scripts are emitted, so the default MV3 CSP holds.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "dist");

function copyStatic(): Plugin {
  return {
    name: "ymd-extension-static",
    apply: "build",
    writeBundle() {
      mkdirSync(outDir, { recursive: true });
      cpSync(resolve(here, "manifest.json"), resolve(outDir, "manifest.json"));
      cpSync(resolve(here, "_locales"), resolve(outDir, "_locales"), { recursive: true });
      cpSync(resolve(here, "icons"), resolve(outDir, "icons"), { recursive: true });
    },
  };
}

export default defineConfig({
  root: here,
  base: "./",
  publicDir: false,
  plugins: [copyStatic()],
  build: {
    outDir,
    emptyOutDir: true,
    target: "chrome116",
    modulePreload: { polyfill: false },
    // Readable output helps store review; the bundle is tiny either way.
    minify: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        popup: resolve(here, "popup.html"),
        background: resolve(here, "src/background.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
  test: {
    root: here,
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
  },
});
