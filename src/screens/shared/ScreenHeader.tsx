import { useEffect, useRef, type ReactNode } from "react";
import { useNav } from "../../store/nav";
import s from "./screen.module.css";

export interface ScreenHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** visually hide the header (the screen's first control speaks for it) */
  hidden?: boolean;
}

/** Page heading; receives focus after in-app navigation so screen readers land on it. */
export function ScreenHeader({ title, description, actions, hidden }: ScreenHeaderProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  const seq = useNav((n) => n.seq);
  useEffect(() => {
    if (seq > 0 && !document.activeElement?.closest("[data-keep-focus]")) {
      ref.current?.focus({ preventScroll: true });
    }
  }, [seq]);
  if (hidden) {
    return (
      <h1 ref={ref} tabIndex={-1} className="visually-hidden">
        {title}
      </h1>
    );
  }
  return (
    <header className={s.header}>
      <div className={s.headerText}>
        <h1 ref={ref} tabIndex={-1} className={s.title}>
          {title}
        </h1>
        {description && <p className={s.desc}>{description}</p>}
      </div>
      {actions && <div className={s.headerActions}>{actions}</div>}
    </header>
  );
}
