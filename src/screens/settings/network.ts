// «Ajustes → Red»: the proxy validator and the option lists. The proxy rules mirror
// `settings::normalize_proxy` in Rust, which stays authoritative (the backend re-checks on save).

/** Proxy schemes yt-dlp understands. `socks5h` / `socks4a` resolve host names on the proxy. */
export const PROXY_SCHEMES = ["http", "https", "socks4", "socks4a", "socks5", "socks5h"] as const;

/** `--socket-timeout` choices in seconds; bounds as `settings::sanitize` enforces them. */
export const TIMEOUT_PRESETS = [10, 20, 30, 60] as const;
export const TIMEOUT_MIN = 1;
export const TIMEOUT_MAX = 300;
/** `--retries` / `--fragment-retries` choices; upper bound as `settings::sanitize` enforces it. */
export const RETRY_PRESETS = [3, 10, 20, 50] as const;
export const RETRIES_MAX = 50;

export type ProxyCheck =
  /** nothing typed: no proxy */
  | { kind: "empty" }
  | { kind: "ok"; value: string }
  /** a user or password in the address: never stored */
  | { kind: "credentials" }
  | { kind: "invalid" };

const SCHEME = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i;
const DOMAIN = /^[a-z0-9][a-z0-9.-]*$/;
const IPV6 = /^\[([0-9a-f:.]+)\]$/;

/** Splits `host[:port]`, with `[v6]` brackets; null when it is not that shape. */
function splitHostPort(authority: string): { host: string; port: string | null } | null {
  const v6 = /^(\[[^\]]*\])(?::(\d*))?$/.exec(authority);
  if (v6) return { host: v6[1], port: v6[2] ?? null };
  const m = /^([^:]*)(?::(\d*))?$/.exec(authority);
  return m ? { host: m[1], port: m[2] ?? null } : null;
}

/**
 * Checks a proxy address as typed. Accepted: a {@link PROXY_SCHEMES} scheme, a host (name,
 * IPv4 or bracketed IPv6), an optional port 1–65535 and at most a trailing `/`. The value is
 * normalized to `scheme://host[:port]` in lower case.
 */
export function checkProxy(raw: string): ProxyCheck {
  const text = raw.trim();
  if (text === "") return { kind: "empty" };
  // Printable ASCII only (no spaces, control characters, `\` or `%`).
  if (!/^[\x21-\x7e]+$/.test(text) || /[\\%]/.test(text)) return { kind: "invalid" };
  const m = SCHEME.exec(text);
  if (!m) return { kind: "invalid" };
  const scheme = m[1].toLowerCase();
  const rest = m[2];
  const end = rest.search(/[/?#]/);
  const authority = end === -1 ? rest : rest.slice(0, end);
  const tail = end === -1 ? "" : rest.slice(end);
  if (authority.includes("@")) return { kind: "credentials" };
  if (!(PROXY_SCHEMES as readonly string[]).includes(scheme)) return { kind: "invalid" };
  if (tail !== "" && tail !== "/") return { kind: "invalid" };
  const hp = splitHostPort(authority);
  if (!hp) return { kind: "invalid" };
  const host = hp.host.toLowerCase();
  const v6 = IPV6.exec(host);
  if (v6) {
    if (!v6[1].includes(":")) return { kind: "invalid" };
  } else if (!DOMAIN.test(host)) {
    return { kind: "invalid" };
  }
  let port = "";
  // `host:` with nothing after the colon means no port, as for the backend's URL parser.
  if (hp.port !== null && hp.port !== "") {
    if (!/^\d{1,5}$/.test(hp.port)) return { kind: "invalid" };
    const n = Number(hp.port);
    if (n < 1 || n > 65535) return { kind: "invalid" };
    // http / https leave their default port out, as the backend's URL parser does.
    const implied = (scheme === "http" && n === 80) || (scheme === "https" && n === 443);
    if (!implied) port = `:${n}`;
  }
  return { kind: "ok", value: `${scheme}://${host}${port}` };
}

/** The normalized proxy, or null when the address is empty or not accepted. */
export function normalizeProxy(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const c = checkProxy(raw);
  return c.kind === "ok" ? c.value : null;
}

/** A whole number within `[min, max]`, else null. */
export function inRange(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
}
