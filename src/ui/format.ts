// Locale-aware formatting for every figure the UI shows.
// All outputs are meant to be rendered in the tabular mono face (<Figure>).

export type FormatLocale = "es" | "en";

export interface FigureParts {
  value: string;
  unit: string;
}

const NBSP = " ";
const BYTE_UNITS = ["B", "KiB", "MiB", "GiB", "TiB"] as const;
const PLACEHOLDER = "—";

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(locale: FormatLocale, digits: number): Intl.NumberFormat {
  const key = `${locale}:${digits}`;
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: true,
    });
    nfCache.set(key, f);
  }
  return f;
}

const valid = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;

/** Binary byte size split into value and unit: 1536 -> { "1.5", "KiB" }. */
export function bytesParts(bytes: number | null | undefined, locale: FormatLocale): FigureParts {
  if (!valid(bytes)) return { value: PLACEHOLDER, unit: "" };
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < BYTE_UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = i === 0 ? 0 : 1;
  return { value: nf(locale, digits).format(v), unit: BYTE_UNITS[i] };
}

export function formatBytes(bytes: number | null | undefined, locale: FormatLocale): string {
  const p = bytesParts(bytes, locale);
  return p.unit ? `${p.value}${NBSP}${p.unit}` : p.value;
}

export function speedParts(
  bytesPerSecond: number | null | undefined,
  locale: FormatLocale,
): FigureParts {
  const p = bytesParts(bytesPerSecond, locale);
  return p.unit ? { value: p.value, unit: `${p.unit}/s` } : p;
}

export function formatSpeed(
  bytesPerSecond: number | null | undefined,
  locale: FormatLocale,
): string {
  const p = speedParts(bytesPerSecond, locale);
  return p.unit ? `${p.value}${NBSP}${p.unit}` : p.value;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Clock-style time: m:ss below an hour (mm:ss when padMinutes), h:mm:ss above. */
function clock(totalSeconds: number, padMinutes: boolean): string {
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${pad2(m)}:${pad2(sec)}`;
  return `${padMinutes ? pad2(m) : m}:${pad2(sec)}`;
}

/** Remaining time, mm:ss or h:mm:ss; unknown renders as --:--. */
export function formatEta(seconds: number | null | undefined): string {
  if (!valid(seconds)) return "--:--";
  return clock(seconds, true);
}

/** Media duration, m:ss or h:mm:ss. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!valid(seconds)) return PLACEHOLDER;
  return clock(seconds, false);
}

export const ACCESSION_DIGITS = 6;

/** Accession number: "N.º 000123" (es) or "No. 000123" (en). */
export function formatAccession(seq: number, locale: FormatLocale): string {
  return `${accessionPrefix(locale)}${NBSP}${accessionDigits(seq)}`;
}

export function accessionPrefix(locale: FormatLocale): string {
  return locale === "es" ? "N.º" : "No.";
}

export function accessionDigits(seq: number): string {
  const n = Number.isFinite(seq) && seq >= 0 ? Math.floor(seq) : 0;
  return String(n).padStart(ACCESSION_DIGITS, "0");
}

/** Whole count with thousands always grouped, as a register prints it: "1.731" / "1,731". */
export function formatCount(n: number, locale: FormatLocale): string {
  if (!Number.isFinite(n)) return PLACEHOLDER;
  // Spanish CLDR skips grouping below 10 000; "always" keeps every count aligned.
  // ("always" is ES2023; the app's lib target still types useGrouping as a boolean)
  const opts = { maximumFractionDigits: 0, useGrouping: "always" } as unknown;
  return new Intl.NumberFormat(locale, opts as Intl.NumberFormatOptions).format(n);
}

/** Whole-number percentage of a fraction 0..1 ("42 %" in es, "42%" in en). */
export function formatPercent(fraction: number | null | undefined, locale: FormatLocale): string {
  if (!valid(fraction)) return PLACEHOLDER;
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(
    Math.min(1, fraction),
  );
}

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.345],
  ["month", 12],
  ["year", Infinity],
];

/** "hace 5 minutos" / "5 minutes ago"; dates older than a week also print the date. */
export function formatRelativeDate(
  date: string | Date,
  locale: FormatLocale,
  now: Date = new Date(),
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return PLACEHOLDER;
  let delta = (d.getTime() - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(delta) < size) {
      if (unit === "week" || unit === "month" || unit === "year") return formatDate(d, locale);
      return rtf.format(Math.round(delta), unit);
    }
    delta /= size;
  }
  return formatDate(d, locale);
}

/** Calendar date like "9 oct 2026" / "Oct 9, 2026". */
export function formatDate(date: string | Date, locale: FormatLocale): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return PLACEHOLDER;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Date as inked on a stamp: "09 OCT 2026" / "09 SEPT 2026"; month in the UI language. */
export function formatStampDate(date: string | Date, locale: FormatLocale): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return PLACEHOLDER;
  const parts = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  const month = get("month").replace(/\./g, "").toLocaleUpperCase(locale);
  return `${get("day")}${NBSP}${month}${NBSP}${get("year")}`;
}
