// The welcome page, opened once after a fresh install: pin the extension to the toolbar, then
// choose the sites. Plain DOM over the static markup of welcome.html.

import { type ChromeApi } from "./chrome-api";
import { cookieDomainAllowed, sanitizeAllowlist } from "./domains";
import { applySystemTheme } from "./popup-view";
import { addSite } from "./sites";
import { KEYS, readAllowlist } from "./storage";
import { siteOf, suggestedProviders } from "./suggestions";

export interface WelcomeDeps {
  api: ChromeApi;
  matchMedia?: (query: string) => MediaQueryList;
}

const YOUTUBE = "youtube.com";

export async function mountWelcome(doc: Document, deps: WelcomeDeps) {
  const { api } = deps;
  const t = (key: string, subs?: string | string[]) => api.i18n.getMessage(key, subs) || key;
  const $ = <T extends HTMLElement>(id: string) => doc.getElementById(id) as T;

  doc.documentElement.lang = (api.i18n.getUILanguage() || "es").split("-")[0];
  applySystemTheme(doc.documentElement, deps.matchMedia);
  for (const el of doc.querySelectorAll<HTMLElement>("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n as string);
  }
  doc.title = t("welcomeTitle");

  let sites: string[] = await readAllowlist(api);

  /**
   * Step 1. Browsers have no API to pin an extension, only to ask whether it is pinned
   * (Chrome 91+), so the page guides and then confirms. Resolves true once there is nothing
   * left to watch: the extension is pinned, or the browser cannot tell.
   */
  async function checkPin(): Promise<boolean> {
    const settings = await api.action.getUserSettings?.().catch(() => undefined);
    const known = typeof settings?.isOnToolbar === "boolean";
    const pinned = settings?.isOnToolbar === true;
    $("step-pin").dataset.done = String(pinned);
    const state = $("pin-state");
    state.hidden = !known;
    state.dataset.tone = pinned ? "ok" : "";
    state.textContent = known ? t(pinned ? "welcomePinDone" : "welcomePinWaiting") : "";
    return pinned || !known;
  }

  /** Step 2: YouTube first (ready, or one click), then the other suggestions. */
  function renderSites(): void {
    const youtube = sites.some((s) => cookieDomainAllowed(YOUTUBE, [s]));
    $("step-sites").dataset.done = String(sites.length > 0);
    $("youtube-ready").hidden = !youtube;
    $("use-youtube").hidden = youtube;
    const others = suggestedProviders(sites).filter((p) => siteOf(p) !== YOUTUBE);
    $("other-sites").hidden = others.length === 0;
    $("other-list").replaceChildren(
      ...others.map((p) => {
        const chip = doc.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.textContent = p.name;
        chip.setAttribute("aria-label", t("suggestAdd", p.name));
        chip.addEventListener("click", () => void add(siteOf(p), p.name));
        return chip;
      }),
    );
  }

  /** Called straight from a click: addSite asks for the permission first, in that gesture. */
  async function add(domain: string, name: string): Promise<void> {
    const res = await addSite(api, sites, domain);
    const out = $("sites-result");
    if (res.ok) {
      sites = res.list;
      out.dataset.tone = "ok";
      out.textContent = t("currentAdded", name);
    } else if (res.reason === "denied") {
      out.dataset.tone = "error";
      out.textContent = t("addDenied", res.domain);
    }
    renderSites();
  }

  $("use-youtube").addEventListener("click", () => void add(YOUTUBE, "YouTube"));

  // The list may change elsewhere (the popup) while this page is open.
  api.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && KEYS.allowlist in changes) {
      sites = sanitizeAllowlist(changes[KEYS.allowlist].newValue);
      renderSites();
    }
  });

  renderSites();
  await checkPin();
  return { checkPin, add };
}

export const PIN_POLL_MS = 1_500;

export interface PinWatchDeps {
  doc: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
  win: Pick<Window, "addEventListener" | "removeEventListener">;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

/**
 * Pinning happens in the browser's own menu, so the page looks again while it is in view, and
 * stops for good once the extension is pinned (or the browser cannot tell). Returns `stop`.
 */
export function watchPin(checkPin: () => Promise<boolean>, deps: PinWatchDeps): () => void {
  let stopped = false;
  const check = () => {
    if (stopped || deps.doc.visibilityState !== "visible") return;
    void checkPin()
      .then((done) => {
        if (done) stop();
      })
      .catch(() => undefined);
  };
  const handle = deps.setInterval(check, PIN_POLL_MS);
  deps.win.addEventListener("focus", check);
  deps.doc.addEventListener("visibilitychange", check);
  function stop(): void {
    if (stopped) return;
    stopped = true;
    deps.clearInterval(handle);
    deps.win.removeEventListener("focus", check);
    deps.doc.removeEventListener("visibilitychange", check);
  }
  return stop;
}
