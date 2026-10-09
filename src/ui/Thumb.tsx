import { useState } from "react";
import { ImageOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import cell from "./ThumbCell.module.css";
import s from "./Thumb.module.css";
import { cx } from "./cx";
import { Icon } from "./Icon";

export interface ThumbProps {
  src: string | null | undefined;
  /** CSS width; height follows 16:9 */
  width?: string;
  className?: string;
}

/** Lazy 16:9 thumbnail; a pencilled placeholder replaces missing or broken images. */
export function Thumb({ src, width = "4rem", className }: ThumbProps) {
  const { t } = useTranslation();
  const [broken, setBroken] = useState<string | null>(null);
  const ok = !!src && broken !== src;
  return (
    <span
      className={cx(cell.frame, s.thumb, className)}
      style={{ width }}
      data-broken={!ok || undefined}
    >
      {ok ? (
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(src)} />
      ) : (
        <span className={cell.placeholder} title={t("ui.thumb.noImage")}>
          <Icon icon={ImageOff} size={14} />
          <span className="visually-hidden">{t("ui.thumb.noImage")}</span>
        </span>
      )}
    </span>
  );
}
