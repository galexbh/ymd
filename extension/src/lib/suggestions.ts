// «Sitios sugeridos»: a few known sites, added in one click (shared by the popup and the welcome
// page). Pure: which providers to offer for a given list.

import { PROVIDERS } from "../../../src/shared/providers";
import { cookieDomainAllowed } from "./domains";

export type Provider = (typeof PROVIDERS)[number];

/** Sites suggested, by provider name (the list shared with the app). */
export const SUGGESTED = ["YouTube", "Vimeo", "SoundCloud", "Twitch"] as const;

/** The site a provider's session lives on (what gets added to the list). */
export function siteOf(provider: Provider): string {
  return provider.domains[0];
}

/** The suggested providers whose site is not on the list yet, in order. */
export function suggestedProviders(sites: readonly string[]): Provider[] {
  return SUGGESTED.map((name) => PROVIDERS.find((p) => p.name === name))
    .filter((p): p is Provider => !!p)
    .filter((p) => !sites.some((s) => cookieDomainAllowed(siteOf(p), [s])));
}
