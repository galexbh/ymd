// Pure classifier for clipboard text: is it exactly one http(s) link, and to which site?
// Nothing here stores, logs or sends the text; callers keep at most the last offered URL
// in memory.
import type { ClipboardWatch } from "../ipc/types";

export interface ClipboardLink {
  /** the trimmed URL, exactly as copied */
  url: string;
  /** display name of a known provider, or the bare host of an unknown link */
  provider: string;
  known: boolean;
}

interface Provider {
  name: string;
  /** registrable domains; subdomains match too (`m.youtube.com`, `artist.bandcamp.com`) */
  domains: readonly string[];
}

/** Curated video/audio sites yt-dlp supports. Hosts match exactly or as a true subdomain. */
export const PROVIDERS: readonly Provider[] = [
  {
    name: "YouTube",
    domains: [
      "youtube.com",
      "youtu.be",
      "music.youtube.com",
      "m.youtube.com",
      "youtube-nocookie.com",
    ],
  },
  { name: "Vimeo", domains: ["vimeo.com"] },
  { name: "SoundCloud", domains: ["soundcloud.com"] },
  { name: "Bandcamp", domains: ["bandcamp.com"] },
  { name: "TikTok", domains: ["tiktok.com"] },
  { name: "X/Twitter", domains: ["x.com", "twitter.com"] },
  { name: "Instagram", domains: ["instagram.com"] },
  { name: "Facebook", domains: ["facebook.com", "fb.watch"] },
  { name: "Twitch", domains: ["twitch.tv"] },
  { name: "Dailymotion", domains: ["dailymotion.com", "dai.ly"] },
  { name: "Reddit", domains: ["reddit.com", "v.redd.it"] },
  { name: "Bilibili", domains: ["bilibili.com"] },
  { name: "Kick", domains: ["kick.com"] },
  { name: "Rumble", domains: ["rumble.com"] },
  { name: "Streamable", domains: ["streamable.com"] },
  { name: "Mixcloud", domains: ["mixcloud.com"] },
  { name: "Odysee", domains: ["odysee.com"] },
];

/** Anything longer is not a link someone copied to download (and is never inspected). */
export const MAX_LINK_LENGTH = 2048;

function providerOf(host: string): Provider | undefined {
  return PROVIDERS.find((p) => p.domains.some((d) => host === d || host.endsWith("." + d)));
}

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
