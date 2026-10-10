import { describe, expect, it } from "vitest";
import {
  bytesParts,
  formatAccession,
  formatBytes,
  formatCount,
  formatDuration,
  formatEta,
  formatPercent,
  formatRelativeDate,
  formatSpeed,
  speedParts,
} from "../format";

const NB = " ";

describe("formatCount", () => {
  it("always groups thousands, also in Spanish", () => {
    expect(formatCount(1731, "es")).toBe("1.731");
    expect(formatCount(1731, "en")).toBe("1,731");
    expect(formatCount(96, "es")).toBe("96");
    expect(formatCount(Number.NaN, "es")).toBe("—");
  });
});

describe("bytes", () => {
  it("uses binary units with locale decimals", () => {
    expect(formatBytes(0, "en")).toBe(`0${NB}B`);
    expect(formatBytes(512, "es")).toBe(`512${NB}B`);
    expect(formatBytes(1536, "en")).toBe(`1.5${NB}KiB`);
    expect(formatBytes(1536, "es")).toBe(`1,5${NB}KiB`);
    expect(formatBytes(1024 * 1024 * 412, "es")).toBe(`412,0${NB}MiB`);
    expect(formatBytes(1.42 * 1024 ** 3, "en")).toBe(`1.4${NB}GiB`);
    expect(bytesParts(10 * 1024 ** 2, "en")).toEqual({ value: "10.0", unit: "MiB" });
  });

  it("renders unknown sizes as a dash", () => {
    expect(formatBytes(null, "es")).toBe("—");
    expect(formatBytes(Number.NaN, "en")).toBe("—");
    expect(formatBytes(-1, "en")).toBe("—");
  });
});

describe("speed", () => {
  it("appends /s", () => {
    expect(formatSpeed(8.4 * 1024 * 1024, "en")).toBe(`8.4${NB}MiB/s`);
    expect(formatSpeed(8.4 * 1024 * 1024, "es")).toBe(`8,4${NB}MiB/s`);
    expect(speedParts(null, "es")).toEqual({ value: "—", unit: "" });
  });
});

describe("eta and duration", () => {
  it("formats eta as mm:ss or h:mm:ss", () => {
    expect(formatEta(0)).toBe("00:00");
    expect(formatEta(97)).toBe("01:37");
    expect(formatEta(59.9)).toBe("00:59");
    expect(formatEta(3600)).toBe("1:00:00");
    expect(formatEta(4021)).toBe("1:07:01");
    expect(formatEta(null)).toBe("--:--");
  });

  it("formats durations as m:ss or h:mm:ss", () => {
    expect(formatDuration(184)).toBe("3:04");
    expect(formatDuration(4021)).toBe("1:07:01");
    expect(formatDuration(null)).toBe("—");
  });
});

describe("accession", () => {
  it("zero-pads to six digits with a localized prefix", () => {
    expect(formatAccession(123, "es")).toBe(`N.º${NB}000123`);
    expect(formatAccession(123, "en")).toBe(`No.${NB}000123`);
    expect(formatAccession(1234567, "es")).toBe(`N.º${NB}1234567`);
    expect(formatAccession(-4, "en")).toBe(`No.${NB}000000`);
  });
});

describe("percent", () => {
  it("is locale aware and clamps at 100", () => {
    expect(formatPercent(0.42, "en")).toBe("42%");
    expect(formatPercent(0.42, "es").replace(/\s/g, " ")).toBe("42 %");
    expect(formatPercent(1.5, "en")).toBe("100%");
  });
});

describe("relative dates", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  it("uses relative words within a week", () => {
    expect(formatRelativeDate("2026-10-09T11:55:00Z", "en", now)).toBe("5 minutes ago");
    expect(formatRelativeDate("2026-10-09T11:55:00Z", "es", now)).toBe("hace 5 minutos");
    expect(formatRelativeDate("2026-10-08T12:00:00Z", "en", now)).toBe("yesterday");
    expect(formatRelativeDate("2026-10-08T12:00:00Z", "es", now)).toBe("ayer");
  });
  it("falls back to a calendar date beyond a week", () => {
    expect(formatRelativeDate("2026-09-01T12:00:00Z", "en", now)).toMatch(/Sep 1, 2026/);
    expect(formatRelativeDate("2026-09-01T12:00:00Z", "es", now)).toMatch(/1 sept? 2026/);
    expect(formatRelativeDate("not a date", "es", now)).toBe("—");
  });
});
