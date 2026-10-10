// Global Vitest setup (jsdom). Loaded for every test file via vite.config.ts `test.setupFiles`.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { clearMocks, mockWindows } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, vi } from "vitest";
import { resetMockBackend } from "../ipc/mock";

// ───────────── jsdom polyfills ─────────────

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

class IntersectionObserverStub implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly scrollMargin = "0px";
  readonly thresholds = [0];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

globalThis.ResizeObserver ??= ResizeObserverStub;
globalThis.IntersectionObserver ??= IntersectionObserverStub;

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

// Tauri's mocks call crypto.getRandomValues for callback ids.
if (!window.crypto?.getRandomValues) {
  Object.defineProperty(window, "crypto", { value: globalThis.crypto, configurable: true });
}

// ───────────── Tauri environment ─────────────

beforeEach(() => {
  // A window label must exist before anything touches @tauri-apps/api/window.
  mockWindows("main");
});

afterEach(() => {
  cleanup();
  resetMockBackend();
  clearMocks();
  vi.useRealTimers();
});
