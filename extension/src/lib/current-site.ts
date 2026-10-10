// «Usar mi sesión de Vimeo»: the site of the active tab, when ymd knows it and the list
// doesn't cover it yet. Pure.
import { providerOf } from "../../../src/shared/providers";
import { cookieDomainAllowed, isPublicSuffix } from "./domains";
import { webLink } from "./links";

export interface CurrentSite {
  /** display name ("Vimeo") */
  name: string;
  /** the domain to add: the provider's main one ("vimeo.com" for player.vimeo.com) */
  domain: string;
}

export function siteToOffer(
  tabUrl: string | undefined,
  allowlist: readonly string[],
): CurrentSite | null {
  const url = webLink(tabUrl);
  if (!url) return null;
  const host = new URL(url).hostname.toLowerCase();
  const provider = providerOf(host);
  if (!provider) return null;
  const domain = provider.domains[0];
  if (
    isPublicSuffix(domain) ||
    cookieDomainAllowed(host, allowlist) ||
    allowlist.includes(domain)
  ) {
    return null;
  }
  return { name: provider.name, domain };
}
