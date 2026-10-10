// Which links «Descargar con ymd» may hand over. Same rules as ymd's own check
// (src-tauri/src/open_url.rs): http(s), at most 2048 characters, no spaces or control
// characters, no user:pass@, and a host with a dot that is not an IP address.

export const MAX_LINK_LENGTH = 2048;

export function webLink(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > MAX_LINK_LENGTH || /[\s\p{Cc}]/u.test(s)) return null;
  const m = /^https?:\/\/([^/?#]*)/i.exec(s);
  if (!m) return null;
  const authority = m[1];
  if (authority.includes("@")) return null;
  const portAt = authority.lastIndexOf(":");
  let host = authority;
  if (portAt !== -1) {
    const port = authority.slice(portAt + 1);
    if (!/^\d+$/.test(port)) return null;
    host = authority.slice(0, portAt);
  }
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((l) => /^[a-z0-9-]+$/i.test(l))) return null;
  if (/^[\d.]+$/.test(host)) return null;
  return s;
}

/** The link a context-menu click points at: the link, then the media, then the page. */
export function clickedLink(info: {
  linkUrl?: string;
  srcUrl?: string;
  pageUrl?: string;
}): string | null {
  return webLink(info.linkUrl) ?? webLink(info.srcUrl) ?? webLink(info.pageUrl);
}
