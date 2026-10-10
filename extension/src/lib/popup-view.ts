// The popup, in plain DOM over the static markup of popup.html.

import { type ChromeApi } from "./chrome-api";
import { isDefaultDomain } from "./domains";
import { addSite, removeSite } from "./sites";
import { stampState, type Status, type StatusError } from "./status";
import { KEYS, readAllowlist, readStatus } from "./storage";
import { type PopupRequest, type PopupResponse } from "./sync";
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

  function renderSites(): void {
    const list = $("site-list");
    list.replaceChildren(
      ...sites.map((domain) => {
        const li = doc.createElement("li");
        li.className = "ledger-row";
        const name = doc.createElement("span");
        name.className = "domain";
        name.textContent = domain;
        li.appendChild(name);
        if (isDefaultDomain(domain)) {
          const tag = doc.createElement("span");
          tag.className = "tag";
          tag.textContent = t("siteDefault");
          li.appendChild(tag);
        }
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
        input.value = "";
        showAddError(null);
        renderSites();
      } else if (res.reason === "invalid") {
        showAddError(t("addInvalid"));
      } else {
        showAddError(t(res.reason === "duplicate" ? "addDuplicate" : "addDenied", res.domain));
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
      });
    }
  });

  renderStatus();
  renderSites();

  return {
    sendNow,
    refresh: renderStatus,
    get sites() {
      return [...sites];
    },
  };
}
