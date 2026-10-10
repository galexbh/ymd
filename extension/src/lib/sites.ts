// Adding and removing allowed sites, with the optional host permission each one needs.

import { type ChromeApi } from "./chrome-api";
import { isPublicSuffix, normalizeDomain, originPattern } from "./domains";
import { writeAllowlist } from "./storage";

type Api = Pick<ChromeApi, "permissions" | "storage">;

export type AddResult =
  | { ok: true; domain: string; list: string[] }
  | { ok: false; reason: "invalid"; input: string }
  | { ok: false; reason: "duplicate" | "denied" | "shared"; domain: string };

/**
 * `current` is the list the popup is showing. It is passed in, not read from storage, because
 * `permissions.request` must run while the click's user gesture is still live: it is the first
 * thing awaited here.
 */
export async function addSite(
  api: Api,
  current: readonly string[],
  input: string,
): Promise<AddResult> {
  const domain = normalizeDomain(input);
  if (!domain) return { ok: false, reason: "invalid", input };
  // Refused before any permission prompt: the grant would cover unrelated sites.
  if (isPublicSuffix(domain)) return { ok: false, reason: "shared", domain };
  if (current.includes(domain)) return { ok: false, reason: "duplicate", domain };
  const granted = await api.permissions
    .request({ origins: [originPattern(domain)] })
    .catch(() => false);
  if (!granted) return { ok: false, reason: "denied", domain };
  const list = [...current, domain];
  await writeAllowlist(api, list);
  return { ok: true, domain, list };
}

/** Removes a site and gives its host permission back. */
export async function removeSite(
  api: Api,
  current: readonly string[],
  domain: string,
): Promise<string[]> {
  const list = current.filter((d) => d !== domain);
  await writeAllowlist(api, list);
  try {
    await api.permissions.remove({ origins: [originPattern(domain)] });
  } catch {
    // A permission that was never granted cannot be removed; the list is what matters.
  }
  return list;
}
