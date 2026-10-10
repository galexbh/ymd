// Collecting the cookies of allowed domains and shaping them for the wire (docs/cookie-bridge.md).

import { type ChromeApi, type ChromeCookie } from "./chrome-api";
import { cookieDomainAllowed } from "./domains";

/** `Cookie` in the bridge contract: a mirror of `chrome.cookies.Cookie`, nothing more. */
export interface WireCookie {
  domain: string;
  hostOnly: boolean;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  session: boolean;
  expirationDate?: number;
  name: string;
  value: string;
}

export function toWire(c: ChromeCookie): WireCookie {
  const out: WireCookie = {
    domain: c.domain,
    hostOnly: c.hostOnly,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    session: c.session,
    name: c.name,
    value: c.value,
  };
  if (!c.session && typeof c.expirationDate === "number") out.expirationDate = c.expirationDate;
  return out;
}

function identity(c: { domain: string; path: string; name: string }): string {
  return `${c.domain}\u0000${c.path}\u0000${c.name}`;
}

function compare(a: WireCookie, b: WireCookie): number {
  return a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : identity(a) < identity(b) ? -1 : 1;
}

/**
 * Reads every allowed domain with `getAll({domain})` and merges the results. Overlapping
 * entries ("google.com" and "accounts.google.com") return the same cookie twice, so cookies are
 * de-duplicated by (domain, path, name) and sorted so the same jar always yields the same list.
 */
export async function collectCookies(
  api: Pick<ChromeApi, "cookies">,
  allowlist: readonly string[],
): Promise<WireCookie[]> {
  const byId = new Map<string, WireCookie>();
  const batches = await Promise.all(allowlist.map((domain) => api.cookies.getAll({ domain })));
  for (const batch of batches) {
    for (const c of batch) {
      // getAll({domain}) also matches parent-domain cookies; keep only what the list allows.
      if (!cookieDomainAllowed(c.domain, allowlist)) continue;
      byId.set(identity(c), toWire(c));
    }
  }
  return [...byId.values()].sort(compare);
}

/** Domains (from the allowlist) that actually contributed cookies, for the status line. */
export function domainsOf(cookies: readonly WireCookie[], allowlist: readonly string[]): string[] {
  return allowlist.filter((d) => cookies.some((c) => cookieDomainAllowed(c.domain, [d])));
}

/**
 * A fingerprint of the jar: name, domain, path, value and expiry of every cookie. Only this hash
 * is stored, never the values themselves.
 */
export async function hashCookies(cookies: readonly WireCookie[]): Promise<string> {
  const rows = cookies
    .map((c) => [c.name, c.domain, c.path, c.value, c.expirationDate ?? null])
    .sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  const bytes = new TextEncoder().encode(JSON.stringify(rows));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
