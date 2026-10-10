// The allowlist: which sites' cookies may travel to ymd. Pure functions only.

// No site comes preset: the person adds the sites they sign in to (the popup suggests a few),
// and each one asks the browser for its own permission at that moment.

/** Defaults earlier versions seeded and later dropped: removed once from stored lists. */
export const RETIRED_DEFAULTS: readonly string[] = ["google.com"];

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

/**
 * Suffixes under which unrelated people own sites (from the Public Suffix List). Allowing one
 * would hand ymd the cookies of every site below it, so they are refused. Not the whole list:
 * the shared hosts people are likely to type, plus the country-code second levels below.
 */
const SHARED_SUFFIXES = new Set([
  "github.io",
  "gitlab.io",
  "blogspot.com",
  "wordpress.com",
  "tumblr.com",
  "appspot.com",
  "herokuapp.com",
  "netlify.app",
  "vercel.app",
  "pages.dev",
  "workers.dev",
  "web.app",
  "firebaseapp.com",
  "azurewebsites.net",
  "cloudfront.net",
  "s3.amazonaws.com",
  "glitch.me",
  "fly.dev",
  "onrender.com",
  "neocities.org",
]);
/** `co.uk`, `com.br`, `ne.jp`…: generic second levels of country-code domains. */
const CC_SECOND_LEVELS = new Set([
  "ac",
  "co",
  "com",
  "edu",
  "go",
  "gob",
  "gov",
  "gv",
  "ltd",
  "mil",
  "ne",
  "net",
  "nic",
  "nom",
  "or",
  "org",
  "plc",
  "sch",
]);

/** True for a domain that is a public suffix (see `SHARED_SUFFIXES`), not someone's site. */
export function isPublicSuffix(domain: string): boolean {
  if (SHARED_SUFFIXES.has(domain)) return true;
  const labels = domain.split(".");
  return labels.length === 2 && labels[1].length === 2 && CC_SECOND_LEVELS.has(labels[0]);
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
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const d = normalizeDomain(item);
    if (d && !isPublicSuffix(d) && !out.includes(d)) out.push(d);
  }
  return out;
}
