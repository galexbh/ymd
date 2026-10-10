// What the popup shows, as stored in chrome.storage.local. Never holds a cookie value.

export type ErrorCode =
  | "host_not_found" // ymd not installed, or it never registered the native host
  | "host_forbidden" // the host manifest does not list this extension's origin
  | "host_failed" // the host crashed, exited early or spoke garbage
  | "host_rejected" // the host answered {ok:false}
  | "unknown";

export interface StatusError {
  code: ErrorCode;
  /** The host's snake_case code when it answered {ok:false}. */
  hostCode?: string;
  /** Human detail for logs; browser or host text, never cookie values. */
  detail?: string;
}

export interface Status {
  /** Epoch ms of the last successful cookies message. */
  lastSyncAt: number | null;
  /** Epoch ms of the last time ymd answered at all (hello or cookies). */
  checkedAt: number | null;
  count: number;
  domains: string[];
  error: StatusError | null;
}

export const EMPTY_STATUS: Status = {
  lastSyncAt: null,
  checkedAt: null,
  count: 0,
  domains: [],
  error: null,
};

export type StampState = "connected" | "offline" | "error";

export function stampState(s: Status): StampState {
  if (s.error) return s.error.code === "host_not_found" ? "offline" : "error";
  return s.lastSyncAt !== null || s.checkedAt !== null ? "connected" : "offline";
}

/** Maps `chrome.runtime.lastError.message` from `sendNativeMessage` to a stable code. */
export function mapLastError(message: string | undefined): StatusError {
  const detail = (message ?? "").slice(0, 300);
  if (/native messaging host not found/i.test(detail)) return { code: "host_not_found", detail };
  if (/forbidden/i.test(detail)) return { code: "host_forbidden", detail };
  if (/(host has exited|communicating with the native messaging host|invalid native)/i.test(detail))
    return { code: "host_failed", detail };
  return { code: "unknown", detail };
}

/** Reads a stored status defensively; anything unexpected becomes the empty status. */
export function parseStatus(value: unknown): Status {
  if (!value || typeof value !== "object") return { ...EMPTY_STATUS };
  const v = value as Partial<Status>;
  const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : null);
  return {
    lastSyncAt: num(v.lastSyncAt),
    checkedAt: num(v.checkedAt),
    count: num(v.count) ?? 0,
    domains: Array.isArray(v.domains) ? v.domains.filter((d) => typeof d === "string") : [],
    error:
      v.error && typeof v.error === "object" && typeof v.error.code === "string"
        ? {
            code: v.error.code,
            hostCode: typeof v.error.hostCode === "string" ? v.error.hostCode : undefined,
            detail: typeof v.error.detail === "string" ? v.error.detail : undefined,
          }
        : null,
  };
}
