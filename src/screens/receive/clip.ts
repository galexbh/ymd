// «Tramo»: the time range of a single video typed as clock times ("90", "1:30", "1:02:03").
// Pure: parsing, formatting and validation; the store turns a valid range into `Clip`.
import type { Clip } from "../../ipc/types";

export type ClipErrorKey =
  | "receive.clip.errorFormat"
  | "receive.clip.errorOrder"
  | "receive.clip.errorBeyond";

export interface ClipCheck {
  /** the range to send; null when both fields are empty or it covers the whole video */
  clip: Clip | null;
  /** i18n key of the problem, null when the input is valid */
  error: ClipErrorKey | null;
  /** the field the error belongs to */
  field: "start" | "end" | null;
}

/** Bare seconds: "90", "7.5". */
const BARE = /^\d+(?:[.,]\d{1,3})?$/;
/** Seconds after a colon: "05", "5", "30.25". */
const SECS = /^\d{1,2}(?:[.,]\d{1,3})?$/;
const LEADING = /^\d+$/;
const MINUTES = /^\d{1,2}$/;

const num = (s: string) => Number(s.replace(",", "."));

/**
 * Seconds from `ss`, `m:ss` or `h:mm:ss` (seconds may carry up to 3 decimals). Minutes and
 * seconds after a colon must be below 60. null when the text is not a clock time.
 */
export function parseClock(text: string): number | null {
  const parts = text.trim().split(":");
  if (parts.length === 1) return BARE.test(parts[0]!) ? num(parts[0]!) : null;
  if (parts.length > 3) return null;
  const sec = parts.pop()!;
  if (!SECS.test(sec) || num(sec) >= 60) return null;
  const [lead, minutes] = parts as [string, string | undefined];
  if (!LEADING.test(lead)) return null;
  if (minutes === undefined) return Number(lead) * 60 + num(sec);
  if (!MINUTES.test(minutes) || Number(minutes) >= 60) return null;
  return Number(lead) * 3600 + Number(minutes) * 60 + num(sec);
}

/** m:ss or h:mm:ss, whole seconds (rounded down). */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

const ok = (clip: Clip | null): ClipCheck => ({ clip, error: null, field: null });
const fail = (error: ClipErrorKey, field: "start" | "end"): ClipCheck => ({
  clip: null,
  error,
  field,
});

/**
 * Checks the two fields against the video's duration. Both empty = the whole video; an empty
 * «Desde» starts at 0:00 and an empty «Hasta» runs to the end. The end may name the last,
 * partial second ("0:20" for a 19.5 s video).
 */
export function validateClip(start: string, end: string, duration: number | null): ClipCheck {
  const startText = start.trim();
  const endText = end.trim();
  if (!startText && !endText) return ok(null);
  const from = startText ? parseClock(startText) : 0;
  if (from === null) return fail("receive.clip.errorFormat", "start");
  const length = duration !== null && Number.isFinite(duration) && duration > 0 ? duration : null;
  let to = endText ? parseClock(endText) : length;
  if (endText && to === null) return fail("receive.clip.errorFormat", "end");
  if (length !== null) {
    if (from >= length) return fail("receive.clip.errorBeyond", "start");
    if (to !== null && to > Math.ceil(length)) return fail("receive.clip.errorBeyond", "end");
    if (to !== null) to = Math.min(to, length);
  }
  if (to === null) return fail("receive.clip.errorFormat", "end");
  if (to <= from) return fail("receive.clip.errorOrder", "end");
  // 0:00 to the end is the whole video: no cut, no re-encode
  if (from === 0 && length !== null && to >= length) return ok(null);
  return ok({ start: from, end: to });
}
