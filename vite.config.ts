/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// Pure modules must keep >= 80% line coverage (plan, Fase 4).
const PURE = { lines: 80 };

// https://vitejs.dev/config/
export default defineConfig(() => ({
  plugins: [react()],

  // Split the bundle so no chunk carries everything: framework, Tauri bindings and the
  // generated yt-dlp site list (~95 KB) each get their own cacheable file.
  build: {
    rollupOptions: {
      output: {
        manualChunks(rawId: string) {
          const id = rawId.split("\\").join("/");
          if (id.includes("supported-sites.json")) return "supported-sites";
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
          if (id.includes("node_modules/@tauri-apps/")) return "tauri";
          if (/node_modules\/(i18next|react-i18next)\//.test(id)) return "i18n";
          return undefined;
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.test.mjs"],
    exclude: ["node_modules", "dist", "e2e/**", "src-tauri/**"],
    restoreMocks: true,
    coverage: {
      provider: "v8" as const,
      reporter: ["text-summary", "html", "lcov", "json-summary"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/**/__tests__/**",
        "src/test/**",
        "src/main.tsx",
        "src/vite-env.d.ts",
        "e2e/**",
      ],
      thresholds: {
        "src/ui/format.ts": PURE,
        "src/theme/**": PURE,
        "src/store/**": PURE,
        "src/ipc/**": PURE,
      },
    },
  },
}));
