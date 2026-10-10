// The allowlist: which sites' cookies may travel to ymd. Pure functions only.

/**
 * Always present on a fresh install; covered by the manifest's required host permissions.
 * YouTube's session cookies (SID, SAPISID, LOGIN_INFO…) live on .youtube.com, which is all
 * yt-dlp reads for it; google.com is not needed and would only look like account access.
 */
export const DEFAULT_DOMAINS: readonly string[] = ["youtube.com"];

/** Defaults earlier versions seeded and later dropped: removed once from stored lists. */
export const RETIRED_DEFAULTS: readonly string[] = ["google.com"];

export function isDefaultDomain(domain: string): boolean {
  return DEFAULT_DOMAINS.includes(domain);
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/**
 * Turns what a person types ("https://www.Vimeo.com/watch", ".vimeo.com", "vimeo.com") into a
 * registrable-looking domain ("vimeo.com"), or null when it is not a domain. A leading "www."
 * is dropped because cookies for the site usually live on the parent domain.
 */
export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme
  s = s.replace(/[/?#].*$/, ""); // path, query, fragment
  s = s.replace(/^[^@]*@/, ""); // userinfo
  s = s.replace(/:\d+$/, ""); // port
  s = s.replace(/^\.+/, "").replace(/\.$/, "");
  if (s.startsWith("www.")) s = s.slice(4);
  if (s.length > 253) return null;
  const labels = s.split(".");
  if (labels.length < 2) return null;
  if (!labels.every((l) => LABEL.test(l))) return null;
  if (!TLD.test(labels[labels.length - 1])) return null;
  return s;
}

/** True when a cookie's domain (".youtube.com", "m.youtube.com") belongs to an allowed domain. */
export function cookieDomainAllowed(cookieDomain: string, allowlist: readonly string[]): boolean {
  const host = cookieDomain.replace(/^\./, "").toLowerCase();
  return allowlist.some((d) => host === d || host.endsWith(`.${d}`));
}

/** The host-permission match pattern that covers a domain and its subdomains. */
export function originPattern(domain: string): string {
  return `*://*.${domain}/*`;
}

/** Cleans a stored allowlist: valid, normalized, unique, in order. */
export function sanitizeAllowlist(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_DOMAINS];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const d = normalizeDomain(item);
    if (d && !out.includes(d)) out.push(d);
  }
  return out;
}
