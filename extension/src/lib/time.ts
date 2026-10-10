// "hace 3 min" / "3 minutes ago", split into parts so the figures can be set in mono.

export interface TimePart {
  text: string;
  figure: boolean;
}

const STEPS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number, number]> = [
  // unit, size in seconds, use while |delta| is below this many seconds
  ["second", 1, 45],
  ["minute", 60, 45 * 60],
  ["hour", 3600, 22 * 3600],
  ["day", 86400, 26 * 86400],
  ["month", 30 * 86400, 320 * 86400],
  ["year", 365 * 86400, Infinity],
];

export function relativeTimeParts(then: number, now: number, locale: string): TimePart[] {
  const seconds = Math.round((then - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  const abs = Math.abs(seconds);
  if (abs < 45) return rtf.formatToParts(0, "second").map(toPart);
  for (const [unit, size, below] of STEPS) {
    if (abs < below) return rtf.formatToParts(Math.round(seconds / size), unit).map(toPart);
  }
  return [];
}

function toPart(p: { type: string; value: string }): TimePart {
  return { text: p.value, figure: p.type === "integer" };
}
