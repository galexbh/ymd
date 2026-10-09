import type { HTMLAttributes } from "react";
import { currentLocale } from "../i18n";
import s from "./Misc.module.css";
import { cx } from "./cx";
import { accessionDigits, accessionPrefix, bytesParts, formatDuration, formatEta, speedParts, type FigureParts } from "./format";

export interface FigureProps extends HTMLAttributes<HTMLSpanElement> {
  value: string | number;
  unit?: string;
  muted?: boolean;
}

/** A number set in tabular mono, with an optional quieter unit. */
export function Figure({ value, unit, muted, className, ...rest }: FigureProps) {
  return (
    <span className={cx("figure", s.figure, muted && s.figureMuted, className)} {...rest}>
      {value}
      {unit ? <span className={s.unit}>{" "}{unit}</span> : null}
    </span>
  );
}

const fromParts = (p: FigureParts, rest: Omit<FigureProps, "value" | "unit">) => <Figure value={p.value} unit={p.unit || undefined} {...rest} />;

export function BytesFigure({ bytes, ...rest }: { bytes: number | null | undefined } & Omit<FigureProps, "value" | "unit">) {
  return fromParts(bytesParts(bytes, currentLocale()), rest);
}

export function SpeedFigure({ bytesPerSecond, ...rest }: { bytesPerSecond: number | null | undefined } & Omit<FigureProps, "value" | "unit">) {
  return fromParts(speedParts(bytesPerSecond, currentLocale()), rest);
}

export function EtaFigure({ seconds, ...rest }: { seconds: number | null | undefined } & Omit<FigureProps, "value" | "unit">) {
  return <Figure value={formatEta(seconds)} {...rest} />;
}

export function DurationFigure({ seconds, ...rest }: { seconds: number | null | undefined } & Omit<FigureProps, "value" | "unit">) {
  return <Figure value={formatDuration(seconds)} {...rest} />;
}

/** Accession number: quiet "N.º" prefix and six zero-padded digits. */
export function Accession({ seq, className, ...rest }: { seq: number } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cx("figure", s.accession, className)} {...rest}>
      <span className={s.accessionPrefix}>{accessionPrefix(currentLocale())}</span>
      {" "}
      {accessionDigits(seq)}
    </span>
  );
}
