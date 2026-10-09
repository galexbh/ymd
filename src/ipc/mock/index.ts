// Entry point of the mock backend: wires `MockBackend` into Tauri's IPC mocks so `api.*` and
// `events.*` (src/ipc) work unchanged in Vitest, Playwright and `pnpm dev:mock`.
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { InvokeArgs } from "@tauri-apps/api/core";
import { MockBackend, type MockBackendOptions } from "./backend";
import type { MockPlatform } from "./fixtures";

export { MockBackend, sanitizeSettings, FAILURE_RULES, PROBE_FAILURE_RULES } from "./backend";
export type { DepsScenario, MockBackendOptions, MockCall, MockDelays, MockEvent } from "./backend";
export { ManualClock, RealClock, flushMicrotasks } from "./clock";
export type { MockClock } from "./clock";
export { thumbnail } from "./fixtures";

let current: MockBackend | null = null;

declare global {
  interface Window {
    __TAURI_OS_PLUGIN_INTERNALS__?: Record<string, string>;
  }
}

function osInternals(platform: MockPlatform): Record<string, string> {
  const win = platform === "windows";
  return {
    platform,
    os_type: platform,
    family: win ? "windows" : "unix",
    version: win ? "10.0.26100" : platform === "macos" ? "15.1.0" : "6.8.0",
    arch: "x86_64",
    eol: win ? "\r\n" : "\n",
    exe_extension: win ? "exe" : "",
  };
}

/**
 * Install a fresh stateful fake backend (replacing any previous one).
 *
 * ```ts
 * const be = installMockBackend({ scenario: "first-run", clock: "manual" });
 * await api.depsInstall("ytdlp");          // pending...
 * be.manualClock.advance(2000);             // ...now resolved, progress events emitted
 * ```
 */
export function installMockBackend(options: MockBackendOptions = {}): MockBackend {
  resetMockBackend();
  const backend = new MockBackend(options, (event, payload) => {
    void emit(event, payload);
  });
  mockWindows("main");
  mockIPC(
    (cmd: string, payload?: InvokeArgs) =>
      backend.invoke(cmd, payload as Record<string, unknown> | undefined),
    { shouldMockEvents: true },
  );
  window.__TAURI_OS_PLUGIN_INTERNALS__ = osInternals(backend.platform);
  current = backend;
  return backend;
}

/** Stop timers and remove the IPC mocks. Safe to call when nothing is installed. */
export function resetMockBackend(): void {
  if (current) {
    current.dispose();
    current = null;
  }
  if (typeof window !== "undefined") clearMocks();
}

/** The backend installed by the last `installMockBackend` call, if any. */
export function getMockBackend(): MockBackend | null {
  return current;
}
