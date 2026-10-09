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
