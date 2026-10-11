// Pure helpers for «Programar inicio»: a wall-clock time (HH:MM, local) → the next instant it
// happens, and how to show a scheduled instant back.

const HHMM = /^(\d{1,2}):(\d{2})$/;

/** `{ hours, minutes }` of a valid 24-hour `HH:MM` (what `<input type="time">` yields), else null. */
export function parseClock(value: string): { hours: number; minutes: number } | null {
  const m = HHMM.exec(value.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/**
 * Next local occurrence of `HH:MM` after `now`: today when it is still ahead, otherwise
 * tomorrow. The same minute as `now` counts as passed (it would start at once).
 */
export function nextOccurrence(value: string, now: Date): Date | null {
  const clock = parseClock(value);
  if (!clock) return null;
  const at = new Date(now);
  at.setHours(clock.hours, clock.minutes, 0, 0);
  if (at.getTime() <= now.getTime()) {
    // setDate then setHours again: a DST change between today and tomorrow keeps HH:MM
    at.setDate(at.getDate() + 1);
    at.setHours(clock.hours, clock.minutes, 0, 0);
  }
  return at;
}

/** `true` when `at` falls on a later calendar day than `now` (local time). */
export function isLaterDay(at: Date, now: Date): boolean {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return day(at) > day(now);
}

/** 24-hour `HH:MM` of `at` in local time. */
export function formatClock(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
