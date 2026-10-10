// Whether a site's session is there, judged by cookie names only (values are never read).
// Same rules as ymd (src-tauri/src/auth/cookies.rs, SESSION_RULES).
import { cookieDomainAllowed } from "./domains";

/** Sites whose session shows in cookie names, and the names that prove it. */
export const SESSION_RULES: Readonly<Record<string, readonly string[]>> = {
  "youtube.com": ["LOGIN_INFO", "SAPISID", "__Secure-3PAPISID"],
};

/** For each ruled site on the list: true when signed in, false when signed out. */
export function sessionsOf(
  cookies: ReadonlyArray<{ domain: string; name: string }>,
  allowlist: readonly string[],
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [site, names] of Object.entries(SESSION_RULES)) {
    if (!allowlist.includes(site)) continue;
    out[site] = cookies.some(
      (c) => cookieDomainAllowed(c.domain, [site]) && names.includes(c.name),
    );
  }
  return out;
}
