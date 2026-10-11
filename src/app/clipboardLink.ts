// Pure classifier for clipboard text: is it exactly one http(s) link, and to which site?
// `parseLinks` applies the same rules to each token of a paste that holds several links.
// Nothing here stores, logs or sends the text; callers keep at most the last offered URL
// in memory.
import type { ClipboardWatch } from "../ipc/types";
import { providerOf } from "../shared/providers";

export { PROVIDERS } from "../shared/providers";

export interface ClipboardLink {
  /** the trimmed URL, exactly as copied */
  url: string;
  /** display name of a known provider, or the bare host of an unknown link */
  provider: string;
  known: boolean;
}

/** Anything longer is not a link someone copied to download (and is never inspected). */
export const MAX_LINK_LENGTH = 2048;

function isIpHost(host: string): boolean {
  // IPv6 literals keep their brackets in URL.hostname; IPv4 is four dotted numbers
  // (WHATWG URL already normalised hex/octal/short forms to dotted decimal).
  return host.startsWith("[") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/** Parse one http(s) link with a plain domain host; null for anything else. */
function parseLink(text: string): { url: string; host: string } | null {
  const url = text.trim();
  if (!url || url.length > MAX_LINK_LENGTH) return null;
  // exactly one token: no spaces, tabs or newlines anywhere
  if (/\s/.test(url)) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || isIpHost(host) || !host.includes(".")) return null;
  return { url, host };
}

/**
 * Classify clipboard text for the counter.
 * - `"known"`: only links to a provider in {@link PROVIDERS}.
 * - `"any"`: also any other http(s) link, with `known: false`.
 * - `"off"`: always null.
 */
export function classify(text: string, mode: ClipboardWatch): ClipboardLink | null {
  if (mode === "off" || typeof text !== "string") return null;
  const link = parseLink(text);
  if (!link) return null;
  const provider = providerOf(link.host);
  if (provider) return { url: link.url, provider: provider.name, known: true };
  if (mode !== "any") return null;
  return { url: link.url, provider: link.host.replace(/^www\./, ""), known: false };
}

/** Most links one paste can hand over; the rest are left out and counted. */
export const MAX_BATCH_LINKS = 200;

export interface ParsedLinks {
  /** distinct links that pass the single-link rules, in paste order, at most {@link MAX_BATCH_LINKS} */
  valid: string[];
  /** distinct tokens that are not a downloadable link */
  invalid: string[];
  /** valid links past {@link MAX_BATCH_LINKS}, left out */
  overflow: number;
}

/**
 * Split pasted text on whitespace (spaces, tabs, newlines) and sort each token with the same
 * rules as a single copied link. Duplicates are dropped silently, keeping the first.
 */
export function parseLinks(text: string): ParsedLinks {
  const out: ParsedLinks = { valid: [], invalid: [], overflow: 0 };
  if (typeof text !== "string") return out;
  const seen = new Set<string>();
  for (const token of text.split(/\s+/)) {
    if (!token || seen.has(token)) continue;
    seen.add(token);
    if (!parseLink(token)) out.invalid.push(token);
    else if (out.valid.length < MAX_BATCH_LINKS) out.valid.push(token);
    else out.overflow++;
  }
  return out;
}
