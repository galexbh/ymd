// Browser-only dev mode (`pnpm dev:mock` = `vite --mode mock`). Imported first thing from
// `src/main.tsx`; in any other mode the condition is statically false and the whole mock is
// tree-shaken out of the bundle.
//
// Pick a scenario with `?scenario=first-run|ready|outdated|complete` (remembered in
// localStorage), speed with `?speed=4`, and Brave state with `?brave=closed`.
// The live backend is available in devtools as `window.__YMD_MOCK__`.
import { installMockBackend, type DepsScenario, type MockBackend } from "./index";

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

export function bootMock(): MockBackend {
  const s = readParam("scenario");
  const scenario = SCENARIOS.includes(s as DepsScenario) ? (s as DepsScenario) : "ready";
  const speed = Number(readParam("speed") ?? "1");
  const backend = installMockBackend({
    scenario,
    speed: Number.isFinite(speed) && speed > 0 ? speed : 1,
    braveRunning: readParam("brave") !== "closed",
    delays: { command: 40, probe: 900, auth: 700 },
  });
  window.__YMD_MOCK__ = backend;
  console.info(
    `[ymd] mock backend active — scenario "${scenario}". Switch with ?scenario=${SCENARIOS.join("|")}`,
  );
  return backend;
}

if (import.meta.env.MODE === "mock") bootMock();
