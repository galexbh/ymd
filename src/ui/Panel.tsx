import { useId, type HTMLAttributes, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import s from "./Surface.module.css";
import { cx } from "./cx";
import { Icon } from "./Icon";

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** heading level for the section title */
  level?: 2 | 3 | 4;
}

/** Ruled section with a small-caps header and optional actions. */
export function Section({ title, description, actions, level = 2, className, children, ...rest }: SectionProps) {
  const id = useId();
  const H = `h${level}` as const;
  return (
    <section aria-labelledby={id} className={cx(s.section, className)} {...rest}>
      <div className={s.sectionHead}>
        <H id={id} className={s.sectionTitle}>
          {title}
        </H>
        {actions && <div className={s.sectionActions}>{actions}</div>}
      </div>
      {description && <p className={s.sectionDesc}>{description}</p>}
      {children}
    </section>
  );
}

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** no outer border or radius, e.g. the shelf rail */
  flush?: boolean;
  as?: "div" | "aside" | "nav" | "section";
}

/** Second neutral layer for rails and side panels. */
export function Panel({ flush, as: Tag = "div", className, ...rest }: PanelProps) {
  return <Tag className={cx(s.panel, flush && s.panelFlush, className)} {...rest} />;
}

export interface EmptyStateProps {
  icon: LucideIcon;
  title: ReactNode;
  /** explain what will appear here and how to make it appear */
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** Empty region that teaches the next step instead of saying "nothing here". */
export function EmptyState({ icon, title, children, actions, className }: EmptyStateProps) {
  return (
    <div className={cx(s.empty, className)}>
      <span className={s.emptyIcon}>
        <Icon icon={icon} size={20} />
      </span>
      <p className={s.emptyTitle}>{title}</p>
      <div className={s.emptyBody}>{children}</div>
      {actions && <div className={s.emptyActions}>{actions}</div>}
    </div>
  );
}

export interface SkeletonProps {
  /** ledger rows (default) or text lines */
  variant?: "rows" | "text";
  count?: number;
  /** relative widths per column for rows, e.g. [6, 40, 8, 10, 20] */
  columns?: number[];
  className?: string;
}

const TEXT_WIDTHS = [92, 78, 85, 60, 70];

/** Loading placeholder drawn as ruled lines, not a spinner. */
export function Skeleton({ variant = "rows", count = 4, columns = [8, 44, 10, 10, 18], className }: SkeletonProps) {
  const { t } = useTranslation();
  const total = columns.reduce((a, b) => a + b, 0);
  return (
    <div className={cx(s.skeleton, variant === "text" && s.skText, className)} role="status" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">{t("ui.skeleton.loading")}</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={s.skLine} aria-hidden="true">
          {variant === "text" ? (
            <span className={s.skBar} style={{ width: `${TEXT_WIDTHS[i % TEXT_WIDTHS.length]}%` }} />
          ) : (
            columns.map((w, j) => (
              <span key={j} className={s.skBar} style={{ flex: `0 0 calc(${(w / total) * 100}% - var(--space-4))`, opacity: j === 1 ? 1 : 0.75 }} />
            ))
          )}
        </div>
      ))}
    </div>
  );
}
