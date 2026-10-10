import { describe, expect, it } from "vitest";
import {
  AA_TEXT,
  CURATED_ACCENTS,
  DEFAULT_ACCENT,
  THEME_SURFACES,
  contrastRatio,
  deriveAccent,
  hexToOklch,
  oklchToHex,
  parseHex,
  type ResolvedTheme,
} from "../accent";

const THEMES: ResolvedTheme[] = ["light", "dark"];

function expectReadable(hex: string | null, theme: ResolvedTheme) {
  const d = deriveAccent(hex, theme);
  const s = THEME_SURFACES[theme];
  for (const bg of [s.surface, s.surface2, s.sunken, s.raised, d.accentSoft]) {
    expect(contrastRatio(d.accent, bg), `${hex} ${theme} accent on ${bg}`).toBeGreaterThanOrEqual(
      AA_TEXT,
    );
  }
  for (const tone of [d.accent, d.accentHover, d.accentActive]) {
    expect(
      contrastRatio(tone, d.onAccent),
      `${hex} ${theme} onAccent on ${tone}`,
    ).toBeGreaterThanOrEqual(AA_TEXT);
  }
  expect(
    contrastRatio(s.text, d.accentSoft),
    `${hex} ${theme} text on soft`,
  ).toBeGreaterThanOrEqual(AA_TEXT);
  expect(contrastRatio(d.focus, s.surface)).toBeGreaterThanOrEqual(3);
  return d;
}

// deterministic PRNG so failures are reproducible
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe("hex / OKLCH", () => {
  it("parses short and long hex", () => {
    expect(parseHex("#fff")).toEqual({ r: 1, g: 1, b: 1 });
    expect(parseHex("000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseHex("#12345")).toBeNull();
    expect(parseHex("violet")).toBeNull();
  });

  it("knows reference OKLCH values", () => {
    const white = hexToOklch("#ffffff");
    expect(white.l).toBeCloseTo(1, 3);
    expect(white.c).toBeCloseTo(0, 3);
    const red = hexToOklch("#ff0000");
    expect(red.l).toBeCloseTo(0.628, 2);
    expect(red.c).toBeCloseTo(0.2577, 2);
    expect(red.h).toBeCloseTo(29.23, 0);
  });

  it("round-trips every sampled sRGB color", () => {
    const rand = rng(7);
    for (let i = 0; i < 500; i++) {
      const hex = `#${Math.floor(rand() * 0xffffff)
        .toString(16)
        .padStart(6, "0")}`;
      expect(oklchToHex(hexToOklch(hex))).toBe(hex);
    }
  });

  it("clamps out-of-gamut colors into sRGB keeping the hue", () => {
    const hex = oklchToHex({ l: 0.7, c: 0.4, h: 300 });
    expect(parseHex(hex)).not.toBeNull();
    expect(hexToOklch(hex).h).toBeCloseTo(300, -1);
  });
});

describe("contrast ratio", () => {
  it("matches WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#0000ff", "#ffffff")).toBeCloseTo(8.59, 2);
    expect(contrastRatio("#ffffff", "#767676")).toBeCloseTo(
      contrastRatio("#767676", "#ffffff"),
      10,
    );
  });
});

describe("deriveAccent", () => {
  it("uses the default violet for null or invalid input", () => {
    expect(deriveAccent(null, "light").accent).toBe(DEFAULT_ACCENT);
    expect(deriveAccent("nope", "light").accent).toBe(DEFAULT_ACCENT);
  });

  it("passes AA in both themes for the curated palette without adjusting", () => {
    expect(CURATED_ACCENTS[0].id).toBe("violet");
    expect(CURATED_ACCENTS.length).toBeGreaterThanOrEqual(8);
    for (const a of CURATED_ACCENTS) {
      for (const t of THEMES) {
        const d = expectReadable(a.hex, t);
        expect(d.adjusted, `${a.id} ${t}`).toBe(false);
        expect(d.accent).toBe(a[t]);
      }
    }
  });

  it("passes AA for 50 random colors after adjustment, in both themes", () => {
    const rand = rng(42);
    for (let i = 0; i < 50; i++) {
      const hex = `#${Math.floor(rand() * 0xffffff)
        .toString(16)
        .padStart(6, "0")}`;
      for (const t of THEMES) expectReadable(hex, t);
    }
  });

  it("flags adjusted only when the tone had to move", () => {
    // already dark enough for the light theme
    expect(deriveAccent("#2b1a80", "light").adjusted).toBe(false);
    expect(deriveAccent("#2b1a80", "light").accent).toBe("#2b1a80");
    // a pale yellow cannot be read on grey-white board
    const y = deriveAccent("#f5e663", "light");
    expect(y.adjusted).toBe(true);
    expect(hexToOklch(y.accent).h).toBeCloseTo(hexToOklch("#f5e663").h, -1);
    // the same yellow reads fine on slate
    expect(deriveAccent("#f5e663", "dark").adjusted).toBe(false);
    // navy is too dark for slate
    expect(deriveAccent("#000080", "dark").adjusted).toBe(true);
  });

  it("handles extremes", () => {
    expectReadable("#ffffff", "light");
    expectReadable("#000000", "dark");
    expectReadable("#808080", "light");
    expectReadable("#808080", "dark");
  });
});
