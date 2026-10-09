// Accent color derivation: sRGB <-> OKLCH, WCAG contrast, and per-theme
// accent tones that always meet AA against the theme's surfaces.
// Pure functions only; no DOM access.

export type ResolvedTheme = "light" | "dark";

export interface Oklch {
  l: number; // 0..1
  c: number; // 0..~0.4
  h: number; // degrees 0..360
}

export interface Rgb {
  r: number; // 0..1, gamma-encoded sRGB
  g: number;
  b: number;
}

export interface AccentTokens {
  accent: string;
  accentHover: string;
  accentActive: string;
  accentSoft: string;
  onAccent: string;
  focus: string;
  /** true when the requested color had to be moved to stay readable */
  adjusted: boolean;
}

/**
 * Surface colors per theme. Must stay identical to the values in
 * src/styles/tokens.css (asserted by the tokens test).
 */
export const THEME_SURFACES: Record<
  ResolvedTheme,
  { surface: string; surface2: string; sunken: string; raised: string; text: string }
> = {
  light: {
    surface: "#eef1f2",
    surface2: "#e1e6e8",
    sunken: "#e5e9eb",
    raised: "#f8fafa",
    text: "#172024",
  },
  dark: {
    surface: "#1b2427",
    surface2: "#151d20",
    sunken: "#131a1d",
    raised: "#222c30",
    text: "#e2e8e9",
  },
};

/** Ink used on top of a light accent in the dark theme. */
const DARK_INK = "#11171a";
const WHITE = "#ffffff";

export const AA_TEXT = 4.5;

export interface CuratedAccent {
  id: string;
  /** canonical value stored in settings */
  hex: string;
  /** hand-tuned tones per theme */
  light: string;
  dark: string;
}

/** Curated accents; the first one is the default violet stamp ink. */
export const CURATED_ACCENTS: readonly CuratedAccent[] = [
  { id: "violet", hex: "#5b3fc4", light: "#5b3fc4", dark: "#a996ff" },
  { id: "indigo", hex: "#3a4fb8", light: "#3a4fb8", dark: "#93a6ff" },
  { id: "teal", hex: "#0f6b6b", light: "#0f6b6b", dark: "#5ec8c4" },
  { id: "green", hex: "#2f6b2f", light: "#2f6b2f", dark: "#8ccf86" },
  { id: "ochre", hex: "#8a5a00", light: "#8a5a00", dark: "#e0b05a" },
  { id: "rust", hex: "#a3401c", light: "#a3401c", dark: "#f29a76" },
  { id: "magenta", hex: "#9c2a74", light: "#9c2a74", dark: "#f08cc8" },
  { id: "graphite", hex: "#3d4a52", light: "#3d4a52", dark: "#b4c2c9" },
];

export const DEFAULT_ACCENT = CURATED_ACCENTS[0].hex;

// ───────────── hex <-> sRGB ─────────────

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export function isHex(hex: string): boolean {
  return parseHex(hex) !== null;
}

export function toHex({ r, g, b }: Rgb): string {
  const c = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

// ───────────── sRGB <-> OKLab/OKLCH (Björn Ottosson) ─────────────

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { l: L, c: C, h: C < 1e-6 ? 0 : H };
}

/** OKLCH to sRGB; channels may fall outside 0..1 when out of gamut. */
export function oklchToRgbUnclamped({ l: L, c: C, h: H }: Oklch): Rgb {
  const hr = (H * Math.PI) / 180;
  const A = C * Math.cos(hr);
  const B = C * Math.sin(hr);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return { r: fromLinear(lr), g: fromLinear(lg), b: fromLinear(lb) };
}

const EPS = 1e-4;
function inGamut({ r, g, b }: Rgb): boolean {
  return [r, g, b].every((v) => v >= -EPS && v <= 1 + EPS);
}

/** Reduces chroma (keeping L and H) until the color fits in sRGB. */
export function clampToGamut(lch: Oklch): Oklch {
  const l = Math.min(1, Math.max(0, lch.l));
  if (inGamut(oklchToRgbUnclamped({ ...lch, l }))) return { ...lch, l };
  let lo = 0;
  let hi = lch.c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToRgbUnclamped({ l, c: mid, h: lch.h }))) lo = mid;
    else hi = mid;
  }
  return { l, c: lo, h: lch.h };
}

export function hexToOklch(hex: string): Oklch {
  const rgb = parseHex(hex);
  if (!rgb) throw new Error(`invalid hex color: ${hex}`);
  return rgbToOklch(rgb);
}

export function oklchToHex(lch: Oklch): string {
  return toHex(oklchToRgbUnclamped(clampToGamut(lch)));
}

// ───────────── WCAG 2.x contrast ─────────────

export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) throw new Error(`invalid hex color: ${hex}`);
  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// ───────────── derivation ─────────────

function backgroundsFor(theme: ResolvedTheme, soft: string): string[] {
  const s = THEME_SURFACES[theme];
  return [s.surface, s.surface2, s.sunken, s.raised, soft];
}

function softFor(lch: Oklch, theme: ResolvedTheme): string {
  return theme === "light"
    ? oklchToHex({ l: 0.915, c: Math.min(lch.c, 0.045), h: lch.h })
    : oklchToHex({ l: 0.315, c: Math.min(lch.c, 0.055), h: lch.h });
}

function onAccentFor(hex: string, theme: ResolvedTheme): string {
  const preferred = theme === "light" ? WHITE : DARK_INK;
  const other = theme === "light" ? DARK_INK : WHITE;
  return contrastRatio(hex, preferred) >= contrastRatio(hex, other) ? preferred : other;
}

function passes(hex: string, theme: ResolvedTheme, soft: string): boolean {
  const worstBg = Math.min(...backgroundsFor(theme, soft).map((bg) => contrastRatio(hex, bg)));
  return worstBg >= AA_TEXT && contrastRatio(hex, onAccentFor(hex, theme)) >= AA_TEXT;
}

/**
 * Walks lightness away from the surface (darker on light, lighter on dark)
 * until the tone passes; hue and chroma are kept as far as the gamut allows.
 */
function readableTone(lch: Oklch, theme: ResolvedTheme, soft: string): Oklch {
  const dir = theme === "light" ? -1 : 1;
  let cur = clampToGamut(lch);
  for (let i = 0; i < 200; i++) {
    if (passes(oklchToHex(cur), theme, soft)) return cur;
    const nl = cur.l + dir * 0.005;
    if (nl < 0 || nl > 1) break;
    cur = clampToGamut({ l: nl, c: lch.c, h: lch.h });
  }
  // Extremes always pass (near-black on light, near-white on dark).
  return clampToGamut({ l: theme === "light" ? 0.2 : 0.95, c: 0, h: lch.h });
}

function shiftTone(base: Oklch, delta: number, theme: ResolvedTheme, soft: string): string {
  const dir = theme === "light" ? -1 : 1;
  const towards = oklchToHex(clampToGamut({ ...base, l: base.l + dir * delta }));
  if (towards !== oklchToHex(base) && passes(towards, theme, soft)) return towards;
  const away = oklchToHex(clampToGamut({ ...base, l: base.l - dir * delta }));
  if (passes(away, theme, soft)) return away;
  return towards;
}

/**
 * Derives the accent tokens for a theme from a user color. Curated colors use
 * their hand-tuned tone; any other color is moved in OKLCH lightness only as
 * far as needed for AA, and reports `adjusted: true` when it moved.
 */
export function deriveAccent(hex: string | null, theme: ResolvedTheme): AccentTokens {
  const requested = hex && isHex(hex) ? normalizeHex(hex) : DEFAULT_ACCENT;
  const curated = CURATED_ACCENTS.find((a) => a.hex === requested);
  const start = hexToOklch(curated ? curated[theme] : requested);

  const soft = softFor(start, theme);
  const tone = readableTone(start, theme, soft);
  const accent = oklchToHex(tone);
  const startHex = oklchToHex(start);
  const adjusted = !curated && accent !== startHex;

  return {
    accent,
    accentHover: shiftTone(tone, 0.05, theme, soft),
    accentActive: shiftTone(tone, 0.1, theme, soft),
    accentSoft: soft,
    onAccent: onAccentFor(accent, theme),
    focus: accent,
    adjusted,
  };
}

export function normalizeHex(hex: string): string {
  const rgb = parseHex(hex);
  return rgb ? toHex(rgb) : hex;
}

/** CSS custom properties for a derived accent. */
export function accentCssVars(t: AccentTokens): Record<string, string> {
  return {
    "--accent": t.accent,
    "--accent-hover": t.accentHover,
    "--accent-active": t.accentActive,
    "--accent-soft": t.accentSoft,
    "--on-accent": t.onAccent,
    "--focus": t.focus,
  };
}
