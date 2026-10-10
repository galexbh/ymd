import { useEffect, useRef, useState, type HTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import type { JobStage } from "../ipc/types";
import s from "./Stamp.module.css";
import { cx } from "./cx";

/** a little longer than --dur-strike */
export const STRIKE_CLEAR_MS = 400;

export interface StampProps extends HTMLAttributes<HTMLSpanElement> {
  stage: JobStage;
  size?: "sm" | "md" | "lg";
  /** overrides the stage word, e.g. a dependency state */
  label?: string;
  /** filing date inked inside the impression, already formatted (see formatStampDate) */
  date?: string;
  /** machine-readable form of `date` for <time> */
  dateTime?: string;
}

/**
 * Rubber-stamp status mark. When the stage changes to "done" while mounted,
 * the stamp strikes onto the row; a row that mounts already archived does not.
 */
export function Stamp({
  stage,
  size = "md",
  label,
  date,
  dateTime,
  className,
  ...rest
}: StampProps) {
  const { t } = useTranslation();
  const prev = useRef(stage);
  const [striking, setStriking] = useState(false);

  useEffect(() => {
    const strike = stage === "done" && prev.current !== "done";
    prev.current = stage;
    if (!strike) return;
    setStriking(true);
    // cleared by timer (not animationend) so reduced motion never leaves it set
    const id = setTimeout(() => setStriking(false), STRIKE_CLEAR_MS);
    return () => clearTimeout(id);
  }, [stage]);

  const text = label ?? t(`stage.${stage}`);
  return (
    <span
      className={cx(
        s.stamp,
        s[stage],
        size !== "md" && s[size],
        striking && s.strike,
        date && s.dated,
        className,
      )}
      data-stage={stage}
      {...rest}
    >
      <span className="visually-hidden">{t("ui.stamp.prefix")} </span>
      <span className={s.label}>{text}</span>
      {date && (
        <time className={s.date} dateTime={dateTime}>
          {date}
        </time>
      )}
    </span>
  );
}
