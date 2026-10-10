// Browser-only dev mode (`pnpm dev:mock` = `vite --mode mock`). Imported first thing from
// `src/main.tsx`; in any other mode the condition is statically false and the whole mock is
// tree-shaken out of the bundle.
//
// Pick a scenario with `?scenario=first-run|ready|outdated|complete` (remembered in
// localStorage), speed with `?speed=4`, Brave state with `?brave=closed`, and the cookie bridge
// with `?ext=synced|none|nobridge` (default `none`: bridge registered, nothing synced yet).
// The live backend is available in devtools as `window.__YMD_MOCK__`.
import {
  installMockBackend,
  type DepsScenario,
  type MockBackend,
  type MockExtensionOptions,
} from "./index";
import { EXTENSION_SYNC_DOMAINS } from "./fixtures";

declare global {
  interface Window {
    __YMD_MOCK__?: MockBackend;
  }
}

const SCENARIOS: DepsScenario[] = ["first-run", "ready", "outdated", "complete", "system-outdated"];

function readParam(name: string): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get(name);
  try {
    if (fromUrl !== null) window.localStorage.setItem(`ymd-mock:${name}`, fromUrl);
    return fromUrl ?? window.localStorage.getItem(`ymd-mock:${name}`);
  } catch {
    return fromUrl;
  }
}

/** `?ext=` → cookie bridge state for dev. */
export function extensionFromParam(value: string | null, now: number): MockExtensionOptions {
  if (value === "nobridge") return { registered: false, lastSync: null };
  if (value === "synced") {
    return {
      registered: true,
      lastSync: {
        at: new Date(now - 4 * 60_000).toISOString(),
        browser: "brave",
        cookieCount: 42,
        domains: EXTENSION_SYNC_DOMAINS,
      },
    };
  }
  return { registered: true, lastSync: null };
}

export function bootMock(): MockBackend {
  const s = readParam("scenario");
  const scenario = SCENARIOS.includes(s as DepsScenario) ? (s as DepsScenario) : "ready";
  const speed = Number(readParam("speed") ?? "1");
  const backend = installMockBackend({
    scenario,
    speed: Number.isFinite(speed) && speed > 0 ? speed : 1,
    braveRunning: readParam("brave") !== "closed",
    firefoxInstalled: readParam("firefox") !== "missing",
    delays: { command: 40, probe: 900, auth: 700 },
    extension: extensionFromParam(readParam("ext"), Date.now()),
  });
  window.__YMD_MOCK__ = backend;
  console.info(
    `[ymd] mock backend active — scenario "${scenario}". Switch with ?scenario=${SCENARIOS.join("|")}`,
  );
  return backend;
}

if (import.meta.env.MODE === "mock") bootMock();
