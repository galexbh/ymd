import { useState } from "react";
import { ImageOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import s from "./ThumbCell.module.css";
import { cx } from "./cx";
import { Accession, Figure } from "./Figure";
import { formatDuration } from "./format";
import { Icon } from "./Icon";

export interface ThumbCellProps {
  /** accession code shown under the image (playlist index or seq) */
  seq: number;
  title: string | null;
  thumbnail: string | null;
  duration?: number | null;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  disabled?: boolean;
  className?: string;
  "data-demo-state"?: string;
}

/** Hand-drawn ink loops (viewBox 100×100, stretched to the cell); picked by index so a
 * selected grid does not repeat one identical ring. */
export const INK_LOOPS = [
  "M8 14 C30 2 78 3 93 12 C99 30 99 72 92 89 C70 98 28 99 9 90 C2 70 1 32 6 12 C9 7 16 5 24 6",
  "M12 7 C40 1 80 4 95 15 C100 40 98 75 90 93 C60 99 25 97 6 88 C1 60 2 30 10 9 C13 4 20 3 30 5",
  "M90 8 C60 1 22 3 7 13 C0 38 2 74 10 92 C38 99 74 98 94 87 C99 60 99 28 92 10 C89 5 82 4 74 5",
] as const;

/** Stamp-size playlist entry; selected entries are circled in ink. */
export function ThumbCell({
  seq,
  title,
  thumbnail,
  duration,
  selected,
  onSelectedChange,
  disabled,
  className,
  "data-demo-state": demo,
}: ThumbCellProps) {
  const { t } = useTranslation();
  const [broken, setBroken] = useState(false);
  return (
    <label
      className={cx(s.cell, className)}
      data-selected={selected || undefined}
      data-disabled={disabled || undefined}
      data-demo-state={demo}
    >
      <input
        type="checkbox"
        className="visually-hidden"
        checked={selected}
        disabled={disabled}
        onChange={(e) => onSelectedChange(e.target.checked)}
      />
      <svg className={s.loop} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d={INK_LOOPS[seq % INK_LOOPS.length]} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className={s.frame}>
        {thumbnail && !broken ? (
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
          />
        ) : (
          <span className={s.placeholder} title={t("ui.thumb.noImage")}>
            <Icon icon={ImageOff} size={18} />
          </span>
        )}
        {duration != null && <Figure value={formatDuration(duration)} className={s.duration} />}
      </span>
      <span className={s.code}>
        <Accession seq={seq} />
      </span>
      <span className={s.title}>{title ?? "—"}</span>
    </label>
  );
}
