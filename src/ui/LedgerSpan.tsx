import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { JobStage } from "../ipc/types";
import { currentLocale } from "../i18n";
import s from "./LedgerSpan.module.css";
import { cx } from "./cx";
import { formatBytes, formatPercent } from "./format";

/**
 * Exact fraction of a span: value/max clamped to 0..1, or null when the total
 * is unknown. No easing and no rounding: the ink is the real share.
 */
export function spanFraction(value: number | null | undefined, max: number | null | undefined): number | null {
  if (value == null || max == null || !Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return null;
  return Math.min(1, Math.max(0, value / max));
}

export interface LedgerSpanProps {
  /** bytes (or units) done */
  value?: number | null;
  /** bytes (or units) in total; null = unknown */
  max?: number | null;
  /** alternative to value/max when only a 0..1 share is known */
  fraction?: number | null;
  stage?: JobStage;
  /** accessible name */
  label?: string;
  /** spoken value, e.g. "12.3 MiB of 40 MiB" */
  valueText?: string;
  thick?: boolean;
  className?: string;
}

export function LedgerSpan({ value, max, fraction: fractionProp, stage, label, valueText, thick, className }: LedgerSpanProps) {
  const { t } = useTranslation();
  let fraction = fractionProp !== undefined ? (fractionProp == null ? null : Math.min(1, Math.max(0, fractionProp))) : spanFraction(value, max);
  if (stage === "done" || stage === "merging" || stage === "postprocessing") fraction = 1;
  const indeterminate = fraction === null;
  const pct = indeterminate ? undefined : fraction! * 100;

  return (
    <div
      role="progressbar"
      aria-label={label ?? t("ui.ledgerSpan.label")}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct === undefined ? undefined : Math.round(pct * 10) / 10}
      aria-valuetext={valueText ?? (indeterminate ? t("ui.ledgerSpan.unknownTotal") : undefined)}
      data-stage={stage}
      className={cx(s.span, indeterminate && s.indeterminate, stage === "error" && s.error, stage === "canceled" && s.canceled, thick && s.thick, className)}
    >
      {!indeterminate && <span className={s.ink} style={{ width: `${pct}%` }} data-empty={pct === 0 ? "true" : undefined} />}
    </div>
  );
}

export interface ProgressDeterminateProps {
  label: ReactNode;
  /** bytes received */
  value: number | null;
  /** bytes total; null = unknown */
  max: number | null;
  failed?: boolean;
  className?: string;
}

/** Labelled progress with exact figures, for dependency installs. */
export function ProgressDeterminate({ label, value, max, failed, className }: ProgressDeterminateProps) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const fraction = spanFraction(value, max);
  const figures =
    max != null
      ? `${formatBytes(value ?? 0, locale)} ${t("ui.progress.of")} ${formatBytes(max, locale)}`
      : formatBytes(value, locale);
  return (
    <div className={cx(s.progress, className)}>
      <div className={s.progressHead}>
        <span className={s.progressLabel}>{label}</span>
        <span className={cx(s.progressFigures, "figure")}>
          {figures}
          {fraction !== null && ` · ${formatPercent(fraction, locale)}`}
        </span>
      </div>
      <LedgerSpan
        value={value}
        max={max}
        stage={failed ? "error" : undefined}
        label={typeof label === "string" ? label : undefined}
        valueText={figures}
        thick
      />
    </div>
  );
}

const LINE: { key: JobStage; at: number }[] = [
  { key: "queued", at: 0 },
  { key: "downloading", at: 1 },
  { key: "merging", at: 2 },
  { key: "done", at: 3 },
];

function stageIndex(stage: JobStage): number {
  switch (stage) {
    case "queued":
      return 0;
    case "downloading":
      return 1;
    case "merging":
    case "postprocessing":
      return 2;
    case "done":
      return 3;
    default:
      return -1;
  }
}

export interface StageLineProps {
  stage: JobStage;
  /** where an error/cancel happened, if known */
  failedAt?: Exclude<JobStage, "error" | "canceled" | "done">;
  className?: string;
}

/** The four job stages at a fixed scale on one baseline. */
export function StageLine({ stage, failedAt = "downloading", className }: StageLineProps) {
  const { t } = useTranslation();
  const failed = stage === "error" || stage === "canceled";
  const cur = failed ? stageIndex(failedAt) : stageIndex(stage);
  const style = { "--reached": cur / 3 } as CSSProperties;
  return (
    <ol className={cx(s.stages, className)} style={style} data-failed={stage === "error" || undefined}>
      {LINE.map(({ key, at }) => {
        const state = at < cur ? "reached" : at === cur ? (failed ? "failed" : stage === "done" ? "reached" : "current") : "todo";
        const word = at === 2 && stage === "postprocessing" ? t("stage.postprocessing") : at === cur && failed ? t(`stage.${stage}`) : t(`stage.${key}`);
        return (
          <li key={key} className={s.stage} data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <span className={s.mark} aria-hidden="true" />
            <span className={s.word}>{word}</span>
          </li>
        );
      })}
    </ol>
  );
}
