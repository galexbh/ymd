import { describe, expect, it } from "vitest";
import { formatClock, isLaterDay, nextOccurrence, parseClock } from "../schedule";

// local-time dates, so the results hold in any time zone
const local = (y: number, mo: number, d: number, h: number, mi: number) =>
  new Date(y, mo - 1, d, h, mi, 0, 0);

describe("parseClock", () => {
  it("accepts 24-hour HH:MM and rejects the rest", () => {
    expect(parseClock("07:05")).toEqual({ hours: 7, minutes: 5 });
    expect(parseClock("7:05")).toEqual({ hours: 7, minutes: 5 });
    expect(parseClock(" 23:59 ")).toEqual({ hours: 23, minutes: 59 });
    for (const bad of ["", "24:00", "12:60", "12", "12:5", "ab:cd", "-1:00"]) {
      expect(parseClock(bad)).toBeNull();
    }
  });
});

describe("nextOccurrence", () => {
  it("is today when the time is still ahead", () => {
    const now = local(2026, 10, 10, 9, 30);
    expect(nextOccurrence("22:00", now)).toEqual(local(2026, 10, 10, 22, 0));
    expect(nextOccurrence("09:31", now)).toEqual(local(2026, 10, 10, 9, 31));
  });

  it("is tomorrow when the time already passed or is now", () => {
    const now = local(2026, 10, 10, 9, 30);
    expect(nextOccurrence("08:00", now)).toEqual(local(2026, 10, 11, 8, 0));
    expect(nextOccurrence("09:30", now)).toEqual(local(2026, 10, 11, 9, 30));
  });

  it("crosses midnight both ways", () => {
    // late evening, early-morning target → next day
    expect(nextOccurrence("00:10", local(2026, 10, 10, 23, 50))).toEqual(
      local(2026, 10, 11, 0, 10),
    );
    // just after midnight, a target later that night → same (new) day
    expect(nextOccurrence("00:10", local(2026, 10, 11, 0, 5))).toEqual(local(2026, 10, 11, 0, 10));
    // seconds past the minute still count as passed
    const almost = new Date(local(2026, 10, 10, 23, 59).getTime() + 30_000);
    expect(nextOccurrence("23:59", almost)).toEqual(local(2026, 10, 11, 23, 59));
  });

  it("rolls over month and year ends", () => {
    expect(nextOccurrence("08:00", local(2026, 12, 31, 23, 30))).toEqual(local(2027, 1, 1, 8, 0));
    expect(nextOccurrence("01:00", local(2026, 2, 28, 2, 0))).toEqual(local(2026, 3, 1, 1, 0));
  });

  it("returns null for an invalid time", () => {
    expect(nextOccurrence("", local(2026, 10, 10, 9, 30))).toBeNull();
  });
});

describe("isLaterDay / formatClock", () => {
  it("tell tomorrow from today and print HH:MM", () => {
    const now = local(2026, 10, 10, 23, 50);
    expect(isLaterDay(local(2026, 10, 10, 23, 55), now)).toBe(false);
    expect(isLaterDay(local(2026, 10, 11, 0, 10), now)).toBe(true);
    expect(formatClock(local(2026, 10, 11, 0, 5))).toBe("00:05");
    expect(formatClock(local(2026, 10, 11, 21, 30))).toBe("21:30");
  });
});
