import { describe, expect, it } from "vitest";
import { formatClipRange, formatClock, parseClock, validateClip } from "../clip";

describe("parseClock", () => {
  it.each([
    ["0", 0],
    ["90", 90],
    [" 7.5 ", 7.5],
    ["7,25", 7.25],
    ["0:00", 0],
    ["1:30", 90],
    ["01:05", 65],
    ["1:5", 65],
    ["75:00", 4500],
    ["1:30.250", 90.25],
    ["1:02:03", 3723],
    ["10:00:00", 36000],
  ])("%s → %s", (text, seconds) => {
    expect(parseClock(text)).toBe(seconds);
  });

  it.each([
    "",
    " ",
    "abc",
    "-5",
    "1:60",
    "1:-5",
    "1:60:00",
    "1:02:03:04",
    ":30",
    "1:",
    "1::30",
    "1.5:00",
    "7.1234",
    "1:30:",
    "1h30",
  ])("rejects %j", (text) => {
    expect(parseClock(text)).toBeNull();
  });
});

describe("formatClipRange", () => {
  it("joins both ends with an en dash", () => {
    expect(formatClipRange({ start: 90, end: 165 })).toBe("1:30–2:45");
    expect(formatClipRange({ start: 0, end: 3723.5 })).toBe("0:00–1:02:03");
  });
});

describe("formatClock", () => {
  it.each([
    [0, "0:00"],
    [7.9, "0:07"],
    [90, "1:30"],
    [599, "9:59"],
    [3600, "1:00:00"],
    [3723.5, "1:02:03"],
    [-4, "0:00"],
    [Number.NaN, "0:00"],
  ])("%s → %s", (seconds, text) => {
    expect(formatClock(seconds)).toBe(text);
  });

  it("round-trips with parseClock", () => {
    for (const s of [0, 5, 59, 60, 61, 3599, 3600, 3661, 86_399]) {
      expect(parseClock(formatClock(s))).toBe(s);
    }
  });
});

describe("validateClip", () => {
  const DURATION = 200.4;

  it("both empty = the whole video", () => {
    expect(validateClip("", "  ", DURATION)).toEqual({ clip: null, error: null, field: null });
  });

  it("a full range", () => {
    expect(validateClip("1:30", "2:45", DURATION)).toEqual({
      clip: { start: 90, end: 165 },
      error: null,
      field: null,
    });
  });

  it("empty «Desde» starts at 0:00, empty «Hasta» runs to the end", () => {
    expect(validateClip("", "0:10", DURATION).clip).toEqual({ start: 0, end: 10 });
    expect(validateClip("3:00", "", DURATION).clip).toEqual({ start: 180, end: DURATION });
  });

  it("0:00 to the end is no cut at all", () => {
    expect(validateClip("0:00", "", DURATION).clip).toBeNull();
    expect(validateClip("0", "3:21", DURATION)).toEqual({ clip: null, error: null, field: null });
  });

  it("the end may name the last, partial second", () => {
    expect(validateClip("3:00", "3:21", DURATION).clip).toEqual({ start: 180, end: DURATION });
  });

  it("flags the field with the problem", () => {
    expect(validateClip("x", "1:00", DURATION)).toEqual({
      clip: null,
      error: "receive.clip.errorFormat",
      field: "start",
    });
    expect(validateClip("0:10", "1:75", DURATION)).toMatchObject({
      error: "receive.clip.errorFormat",
      field: "end",
    });
    expect(validateClip("2:00", "1:00", DURATION)).toMatchObject({
      error: "receive.clip.errorOrder",
      field: "end",
    });
    expect(validateClip("1:00", "1:00", DURATION)).toMatchObject({
      error: "receive.clip.errorOrder",
      field: "end",
    });
    expect(validateClip("0:10", "3:22", DURATION)).toMatchObject({
      error: "receive.clip.errorBeyond",
      field: "end",
    });
    expect(validateClip("3:21", "", DURATION)).toMatchObject({
      error: "receive.clip.errorBeyond",
      field: "start",
    });
  });

  it("without a known duration «Hasta» is required", () => {
    expect(validateClip("10", "20", null).clip).toEqual({ start: 10, end: 20 });
    expect(validateClip("10", "", null)).toMatchObject({
      error: "receive.clip.errorFormat",
      field: "end",
    });
    expect(validateClip("10", "", 0).field).toBe("end");
  });
});
