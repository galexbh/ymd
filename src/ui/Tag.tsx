import type { HTMLAttributes } from "react";
import s from "./Misc.module.css";
import { cx } from "./cx";

export type TagTone = "neutral" | "accent" | "danger" | "warning";

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: TagTone;
  /** for format codes and figures */
  mono?: boolean;
}

/** Small label for formats, presets and dependency levels. */
export function Tag({ tone = "neutral", mono, className, ...rest }: TagProps) {
  return (
    <span
      className={cx(
        s.tag,
        mono && s.tagMono,
        tone === "accent" && s.tagAccent,
        tone === "danger" && s.tagDanger,
        tone === "warning" && s.tagWarning,
        className,
      )}
      {...rest}
    />
  );
}
