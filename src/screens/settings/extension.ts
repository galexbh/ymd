// Pure helpers of the cookie bridge card (ExtensionCard.tsx).
import type { Browser, ExtensionStatus, JobStage } from "../../ipc/types";
import { BROWSER_NAMES } from "../shared/errorFixes";
import { CHROMIUM } from "./constants";

/** How often the card asks for the bridge state while Cuentas is open. */
export const EXTENSION_POLL_MS = 5000;

export type BridgeState = "connected" | "pending" | "noBridge";

export function bridgeState(st: ExtensionStatus): BridgeState {
  if (st.lastSync) return "connected";
  return st.targets.some((t) => t.registered) ? "pending" : "noBridge";
}

export const STAMP: Record<BridgeState, JobStage> = {
  connected: "done",
  pending: "queued",
  noBridge: "error",
};

/** Display name for the browser string the extension reports ("brave", "other", ...). */
export function syncBrowserName(browser: string): string {
  if (browser in BROWSER_NAMES) return BROWSER_NAMES[browser as Browser];
  return browser ? browser[0].toUpperCase() + browser.slice(1) : browser;
}

/** Chromium browsers the bridge supports (the ones ymd registers its host for). */
const BRIDGE_BROWSERS: Browser[] = ["brave", "chrome", "chromium", "edge", "vivaldi"];

/** The browser's internal extensions page (it can't be opened by another program: paste it). */
export function extensionsUrl(b: Browser): string {
  switch (b) {
    case "brave":
      return "brave://extensions";
    case "edge":
      return "edge://extensions";
    case "vivaldi":
      return "vivaldi://extensions";
    default:
      return "chrome://extensions";
  }
}

/**
 * Browser the card sets up: the user's default browser when the bridge supports it, else the
 * Chromium browser picked as cookie source, else the one that last synced, else the first
 * installed target (Brave leads).
 */
export function pageBrowser(st: ExtensionStatus, chosen: Browser | null): Browser {
  const installed = st.targets.filter((t) => t.installed).map((t) => t.browser);
  if (st.defaultBrowser && BRIDGE_BROWSERS.includes(st.defaultBrowser)) return st.defaultBrowser;
  if (chosen && CHROMIUM.includes(chosen) && installed.includes(chosen)) return chosen;
  const synced = st.lastSync?.browser as Browser | undefined;
  if (synced && installed.includes(synced)) return synced;
  return installed[0] ?? st.targets[0]?.browser ?? "brave";
}
