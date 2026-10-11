// chrome.storage.local keys and typed accessors. Shared by the service worker and the popup.

import { type ChromeApi } from "./chrome-api";
import { presetDomains, sanitizeAllowlist } from "./domains";
import { parseStatus, type Status, type StatusError } from "./status";

export const KEYS = {
  allowlist: "allowlist",
  status: "status",
  /** SHA-256 of the last jar ymd accepted. The only trace of cookie content we keep. */
  lastHash: "lastHash",
  /** Hash and error code of the last failed attempt (never cookie values), for the backoff. */
  lastFailure: "lastFailure",
} as const;

/** chrome.storage.session: a debounced sync was waiting when the worker last ran. */
export const SESSION_KEYS = {
  pendingSince: "pendingSince",
} as const;

/** The last failed send: what was tried, why it failed and when to try on its own again. */
export interface Failure {
  hash: string;
  code: StatusError["code"];
  /** Consecutive failures with this same hash and code. */
  attempts: number;
  /** Epoch ms before which automatic syncs leave this jar alone. */
  nextAt: number;
}

type Api = Pick<ChromeApi, "storage">;

export async function readAllowlist(api: Api): Promise<string[]> {
  const got = await api.storage.local.get(KEYS.allowlist);
  return KEYS.allowlist in got ? sanitizeAllowlist(got[KEYS.allowlist]) : [];
}

export async function writeAllowlist(api: Api, domains: readonly string[]): Promise<void> {
  await api.storage.local.set({ [KEYS.allowlist]: sanitizeAllowlist([...domains]) });
}

/**
 * Starts the list on first install with the preset sites (the manifest's required host
 * permissions: youtube.com in the build ymd ships, none in the store build), without touching
 * an existing one.
 */
export async function ensureAllowlist(api: Pick<ChromeApi, "storage" | "runtime">): Promise<void> {
  const got = await api.storage.local.get(KEYS.allowlist);
  if (!(KEYS.allowlist in got)) {
    await writeAllowlist(api, presetDomains(api.runtime.getManifest().host_permissions));
  }
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
    sessions: Object.fromEntries(
      Object.entries(status.sessions ?? {}).filter(([, b]) => typeof b === "boolean"),
    ),
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

export async function readFailure(api: Api): Promise<Failure | null> {
  const got = await api.storage.local.get(KEYS.lastFailure);
  const v = got[KEYS.lastFailure] as Partial<Failure> | null | undefined;
  if (!v || typeof v !== "object") return null;
  const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  if (typeof v.hash !== "string" || typeof v.code !== "string") return null;
  if (!finite(v.attempts) || !finite(v.nextAt)) return null;
  return { hash: v.hash, code: v.code, attempts: v.attempts, nextAt: v.nextAt };
}

export async function writeFailure(api: Api, failure: Failure | null): Promise<void> {
  // Field by field, like the status: only a hash, a code and two numbers are ever stored.
  const clean = failure
    ? {
        hash: failure.hash,
        code: failure.code,
        attempts: failure.attempts,
        nextAt: failure.nextAt,
      }
    : null;
  await api.storage.local.set({ [KEYS.lastFailure]: clean });
}
