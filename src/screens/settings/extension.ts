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

/** Chromium browsers ymd registers its host for by name (forks use the Chrome fallback). */
const BRIDGE_BROWSERS: Browser[] = ["brave", "chrome", "chromium", "edge", "vivaldi"];

/** Extensions page of a Chromium fork, by its display name; most forks accept chrome://. */
export function forkExtensionsUrl(name: string): string {
  const n = name.toLowerCase();
  if (n.startsWith("opera")) return "opera://extensions";
  if (n.startsWith("yandex")) return "browser://extensions";
  if (n.startsWith("whale")) return "whale://extensions";
  if (n.startsWith("vivaldi")) return "vivaldi://extensions";
  if (n.startsWith("brave")) return "brave://extensions";
  if (n.startsWith("edge")) return "edge://extensions";
  return "chrome://extensions";
}

/** What the card sets up: a browser to launch (null = the default one by its executable). */
export interface CardTarget {
  browser: Browser | null;
  name: string;
  url: string;
}

export function cardTarget(st: ExtensionStatus, chosen: Browser | null): CardTarget {
  const d = st.defaultBrowser;
  if (st.defaultBrowserChromium && !(d && BRIDGE_BROWSERS.includes(d))) {
    // A Chromium fork ymd knows only by name (Opera GX, Arc, Yandex, Thorium…).
    const name = st.defaultBrowserName ?? "Chromium";
    return { browser: null, name, url: forkExtensionsUrl(name) };
  }
  const browser = pageBrowser(st, chosen);
  return { browser, name: BROWSER_NAMES[browser], url: extensionsUrl(browser) };
}

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
