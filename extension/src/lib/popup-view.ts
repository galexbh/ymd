// The popup, in plain DOM over the static markup of popup.html.

import { type ChromeApi } from "./chrome-api";
import { originPattern } from "./domains";
import { addSite, removeSite } from "./sites";
import { stampState, type Status, type StatusError } from "./status";
import { KEYS, readAllowlist, readStatus } from "./storage";
import { type PopupRequest, type PopupResponse } from "./sync";
import { siteToOffer } from "./current-site";
import { webLink } from "./links";
import { siteOf, suggestedProviders } from "./suggestions";
import { relativeTimeParts } from "./time";

export interface PopupDeps {
  api: ChromeApi;
  now?: () => number;
  matchMedia?: (query: string) => MediaQueryList;
}

const STAMP_KEY = {
  connected: "stampConnected",
  offline: "stampOffline",
  error: "stampError",
} as const;

const ERROR_KEYS: Record<StatusError["code"], [string, string]> = {
  host_not_found: ["errorHostNotFound", "errorHostNotFoundHint"],
  host_forbidden: ["errorForbidden", "errorForbiddenHint"],
  host_failed: ["errorHostFailed", "errorHostFailedHint"],
  host_rejected: ["errorRejected", "errorRejectedHint"],
  unknown: ["errorUnknown", "errorUnknownHint"],
};

const SVG_NS = "http://www.w3.org/2000/svg";

/** Rows shown before «Mostrar todos (N)» folds the rest of a long list. */
export const SITES_FOLDED = 5;

function xIcon(doc: Document): SVGSVGElement {
  // Lucide "x", stroke 1.75.
  const svg = doc.createElementNS(SVG_NS, "svg");
  for (const [k, v] of Object.entries({
    viewBox: "0 0 24 24",
    width: "16",
    height: "16",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.75",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    class: "icon",
  })) {
    svg.setAttribute(k, v);
  }
  for (const d of ["M18 6 6 18", "m6 6 12 12"]) {
    const path = doc.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

/** Follows the system theme, as the app does before the user picks one. */
export function applySystemTheme(
  root: HTMLElement,
  matchMedia: ((q: string) => MediaQueryList) | undefined,
): void {
  const mq = matchMedia?.("(prefers-color-scheme: dark)");
  const set = () => (root.dataset.theme = mq?.matches ? "dark" : "light");
  set();
  mq?.addEventListener?.("change", set);
}

export async function mountPopup(doc: Document, deps: PopupDeps) {
  const { api } = deps;
  const now = deps.now ?? Date.now;
  const t = (key: string, subs?: string | string[]) => api.i18n.getMessage(key, subs) || key;
  const lang = api.i18n.getUILanguage() || "es";
  const $ = <T extends HTMLElement>(id: string) => doc.getElementById(id) as T;

  doc.documentElement.lang = lang.split("-")[0];
  applySystemTheme(doc.documentElement, deps.matchMedia);
  for (const el of doc.querySelectorAll<HTMLElement>("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n as string);
  }
  $<HTMLInputElement>("add-input").placeholder = t("addPlaceholder");

  let status: Status = await readStatus(api);
  let sites: string[] = await readAllowlist(api);
  // A long list starts folded; a site just added is always shown (it unfolds the list).
  let expanded = false;

  function renderStatus(): void {
    const state = stampState(status);
    const stamp = $("stamp");
    stamp.dataset.state = state;
    $("stamp-word").textContent = t(STAMP_KEY[state]);

    const last = $("last-sync");
    last.replaceChildren();
    if (status.lastSyncAt === null) {
      last.textContent = t("lastSyncNever");
      last.removeAttribute("title");
    } else {
      for (const part of relativeTimeParts(status.lastSyncAt, now(), lang)) {
        if (part.figure) {
          const fig = doc.createElement("span");
          fig.className = "figure";
          fig.textContent = part.text;
          last.appendChild(fig);
        } else {
          last.appendChild(doc.createTextNode(part.text));
        }
      }
      last.title = new Date(status.lastSyncAt).toLocaleString(lang);
    }
    $("count").textContent = new Intl.NumberFormat(lang).format(status.count);
    const yt = status.sessions["youtube.com"];
    $("session-fact").hidden = yt === undefined;
    if (yt !== undefined) {
      const dd = $("session-youtube");
      dd.textContent = yt ? t("sessionActive") : t("sessionClosed");
      dd.dataset.state = yt ? "active" : "closed";
    }

    const notice = $("notice");
    if (status.error) {
      const [text, hint] = ERROR_KEYS[status.error.code] ?? ERROR_KEYS.unknown;
      $("notice-text").textContent = t(text, status.error.hostCode ?? "");
      $("notice-hint").textContent = t(hint);
      notice.dataset.tone = state;
      notice.hidden = false;
    } else {
      notice.hidden = true;
    }
  }

  /** Puts a just-added site on screen: past the fifth row, the list unfolds. */
  function revealSite(domain: string): void {
    if (sites.indexOf(domain) >= SITES_FOLDED) expanded = true;
  }

  const toggle = $<HTMLButtonElement>("sites-toggle");
  toggle.addEventListener("click", () => {
    expanded = !expanded;
    renderSites();
  });

  function renderSites(): void {
    const list = $("site-list");
    const folds = sites.length > SITES_FOLDED;
    const shown = folds && !expanded ? sites.slice(0, SITES_FOLDED) : sites;
    toggle.hidden = !folds;
    toggle.setAttribute("aria-expanded", String(folds && expanded));
    toggle.textContent = expanded ? t("sitesShowLess") : t("sitesShowAll", String(sites.length));
    list.replaceChildren(
      ...shown.map((domain) => {
        const li = doc.createElement("li");
        li.className = "ledger-row";
        const name = doc.createElement("span");
        name.className = "domain";
        name.textContent = domain;
        li.appendChild(name);
        // A site whose permission is gone (e.g. revoked in the browser) offers to grant it again.
        void api.permissions
          .contains({ origins: [originPattern(domain)] })
          .then((ok) => {
            if (ok) return;
            const grant = doc.createElement("button");
            grant.type = "button";
            grant.className = "button secondary grant";
            grant.textContent = t("siteGrant");
            grant.setAttribute("aria-label", t("siteGrantLabel", domain));
            grant.addEventListener("click", () => {
              void api.permissions
                .request({ origins: [originPattern(domain)] })
                .catch(() => false)
                .then((granted) => {
                  if (granted) renderSites();
                });
            });
            li.insertBefore(grant, remove);
          })
          .catch(() => undefined);
        const remove = doc.createElement("button");
        remove.type = "button";
        remove.className = "button ghost icon-only";
        remove.dataset.domain = domain;
        remove.setAttribute("aria-label", t("siteRemove", domain));
        remove.title = t("siteRemove", domain);
        remove.appendChild(xIcon(doc));
        remove.addEventListener("click", () => {
          void removeSite(api, sites, domain).then((next) => {
            sites = next;
            renderSites();
          });
        });
        li.appendChild(remove);
        return li;
      }),
    );
    $("sites-empty").hidden = sites.length > 0;
    renderSuggestions();
  }

  /** «Sitios sugeridos»: known sites not on the list yet, one click each (permission included). */
  function renderSuggestions(): void {
    const options = suggestedProviders(sites);
    $("suggest").hidden = options.length === 0;
    $("suggest-list").replaceChildren(
      ...options.map((p) => {
        const chip = doc.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.textContent = p.name;
        chip.setAttribute("aria-label", t("suggestAdd", p.name));
        chip.addEventListener("click", () => {
          // addSite asks for the permission first, inside this click's user gesture.
          void addSite(api, sites, siteOf(p)).then((res) => {
            if (res.ok) {
              sites = res.list;
              revealSite(res.domain);
              showAddError(null);
              renderSites();
            } else if (res.reason === "denied") {
              showAddError(t("addDenied", res.domain));
            }
          });
        });
        return chip;
      }),
    );
  }

  function showAddError(message: string | null): void {
    const err = $("add-error");
    const input = $<HTMLInputElement>("add-input");
    err.textContent = message ?? "";
    err.hidden = !message;
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  const send = $<HTMLButtonElement>("send-now");
  async function sendNow(): Promise<void> {
    if (send.getAttribute("aria-busy") === "true") return;
    send.setAttribute("aria-busy", "true");
    $("send-label").textContent = t("sending");
    try {
      const res = (await api.runtime.sendMessage({ type: "send-now" } satisfies PopupRequest)) as
        PopupResponse | undefined;
      if (res?.status) status = res.status;
      else status = await readStatus(api);
    } catch (e) {
      status = {
        ...status,
        error: { code: "unknown", detail: e instanceof Error ? e.message : String(e) },
      };
    } finally {
      send.removeAttribute("aria-busy");
      $("send-label").textContent = t("sendNow");
      renderStatus();
    }
  }
  send.addEventListener("click", () => void sendNow());

  const form = $<HTMLFormElement>("add-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $<HTMLInputElement>("add-input");
    // addSite awaits permissions.request first, inside this click's user gesture.
    void addSite(api, sites, input.value).then((res) => {
      if (res.ok) {
        sites = res.list;
        revealSite(res.domain);
        input.value = "";
        showAddError(null);
        renderSites();
      } else if (res.reason === "invalid") {
        showAddError(t("addInvalid"));
      } else {
        const key =
          res.reason === "duplicate"
            ? "addDuplicate"
            : res.reason === "shared"
              ? "addShared"
              : "addDenied";
        showAddError(t(key, res.domain));
      }
    });
  });
  $<HTMLInputElement>("add-input").addEventListener("input", () => showAddError(null));

  // Keep in step with the service worker (debounced syncs, alarms) while the popup is open.
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (KEYS.status in changes) {
      void readStatus(api).then((s) => {
        status = s;
        renderStatus();
      });
    }
    if (KEYS.allowlist in changes) {
      void readAllowlist(api).then((s) => {
        sites = s;
        renderSites();
        renderCurrentSite();
      });
    }
  });

  // «Esta página» offers «Usar mi sesión de Vimeo» when ymd knows the active site (readable
  // thanks to activeTab) and the list doesn't cover it yet. Nothing to offer, no section.
  let tabUrl: string | undefined;
  try {
    tabUrl = (await api.tabs.query({ active: true, currentWindow: true }))[0]?.url;
  } catch {
    tabUrl = undefined;
  }
  const pageUrl = webLink(tabUrl);
  if (pageUrl) $("current-host").textContent = new URL(pageUrl).hostname.replace(/^www\./, "");
  const addCurrent = $<HTMLButtonElement>("add-current");
  function renderCurrentSite(): void {
    const offer = siteToOffer(tabUrl, sites);
    addCurrent.hidden = !offer;
    if (offer) $("add-current-label").textContent = t("currentUseSession", offer.name);
    // The result of a click stays readable after the offer is gone.
    $("current").hidden = !pageUrl || (!offer && !$("add-current-result").textContent);
  }
  async function addCurrentSite(): Promise<void> {
    const offer = siteToOffer(tabUrl, sites);
    if (!offer) return;
    const result = $("add-current-result");
    // addSite asks for the permission first, inside this click's user gesture.
    const res = await addSite(api, sites, offer.domain);
    if (res.ok) {
      sites = res.list;
      revealSite(res.domain);
      renderSites();
      result.textContent = t("currentAdded", offer.name);
      result.dataset.tone = "ok";
    } else {
      result.textContent =
        res.reason === "invalid"
          ? t("addInvalid")
          : t(res.reason === "denied" ? "addDenied" : "addDuplicate", res.domain);
      result.dataset.tone = "error";
    }
    renderCurrentSite();
  }
  addCurrent.addEventListener("click", () => void addCurrentSite());
  renderCurrentSite();

  renderStatus();
  renderSites();

  return {
    addCurrentSite,
    sendNow,
    refresh: renderStatus,
    get sites() {
      return [...sites];
    },
  };
}
