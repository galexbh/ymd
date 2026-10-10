// chrome.storage.local keys and typed accessors. Shared by the service worker and the popup.

import { type ChromeApi } from "./chrome-api";
import { DEFAULT_DOMAINS, RETIRED_DEFAULTS, sanitizeAllowlist } from "./domains";
import { parseStatus, type Status } from "./status";

export const KEYS = {
  allowlist: "allowlist",
  status: "status",
  /** SHA-256 of the last jar ymd accepted. The only trace of cookie content we keep. */
  lastHash: "lastHash",
  /** Schema of the stored allowlist; 2 = google.com is no longer a default (extension 1.1.0). */
  allowlistVersion: "allowlistVersion",
} as const;

export const ALLOWLIST_VERSION = 2;

type Api = Pick<ChromeApi, "storage">;

export async function readAllowlist(api: Api): Promise<string[]> {
  const got = await api.storage.local.get(KEYS.allowlist);
  return KEYS.allowlist in got ? sanitizeAllowlist(got[KEYS.allowlist]) : [...DEFAULT_DOMAINS];
}

export async function writeAllowlist(api: Api, domains: readonly string[]): Promise<void> {
  await api.storage.local.set({ [KEYS.allowlist]: sanitizeAllowlist([...domains]) });
}

/**
 * Seeds the defaults on first install without touching a list the user already edited. On the
 * first run after an update it drops the retired defaults once; a site the person adds again
 * afterwards stays.
 */
export async function ensureAllowlist(api: Api): Promise<void> {
  const got = await api.storage.local.get([KEYS.allowlist, KEYS.allowlistVersion]);
  if (!(KEYS.allowlist in got)) {
    await writeAllowlist(api, DEFAULT_DOMAINS);
  } else if (got[KEYS.allowlistVersion] !== ALLOWLIST_VERSION) {
    const list = sanitizeAllowlist(got[KEYS.allowlist]);
    await writeAllowlist(
      api,
      list.filter((d) => !RETIRED_DEFAULTS.includes(d)),
    );
  }
  await api.storage.local.set({ [KEYS.allowlistVersion]: ALLOWLIST_VERSION });
}

export async function readStatus(api: Api): Promise<Status> {
  const got = await api.storage.local.get(KEYS.status);
  return parseStatus(got[KEYS.status]);
}

export async function writeStatus(api: Api, status: Status): Promise<void> {
  // Rebuilt field by field so nothing else (least of all a cookie) can ride along.
  const clean: Status = {
    lastSyncAt: status.lastSyncAt,
    checkedAt: status.checkedAt,
    count: status.count,
    domains: [...status.domains],
    error: status.error
      ? {
          code: status.error.code,
          ...(status.error.hostCode ? { hostCode: status.error.hostCode } : {}),
          ...(status.error.detail ? { detail: status.error.detail } : {}),
        }
      : null,
  };
  await api.storage.local.set({ [KEYS.status]: clean });
}

export async function readHash(api: Api): Promise<string | null> {
  const got = await api.storage.local.get(KEYS.lastHash);
  const h = got[KEYS.lastHash];
  return typeof h === "string" ? h : null;
}

export async function writeHash(api: Api, hash: string | null): Promise<void> {
  await api.storage.local.set({ [KEYS.lastHash]: hash });
}
