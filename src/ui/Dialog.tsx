import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import s from "./Overlay.module.css";
import { IconButton } from "./Button";
import { cx } from "./cx";

export interface DialogProps {
  open: boolean;
  /** called on Esc, the close button, or a backdrop click */
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** close when clicking outside the panel (default true) */
  dismissOnBackdrop?: boolean;
  className?: string;
}

/**
 * Native modal <dialog>. Focus moves inside on open and returns to the
 * previously focused element on close. Use only when the task needs
 * protected focus (confirmations, secrets prompts).
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
  dismissOnBackdrop = true,
  className,
}: DialogProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      returnTo.current = document.activeElement as HTMLElement | null;
      if (typeof el.showModal === "function") el.showModal();
      else el.setAttribute("open", "");
      const target =
        el.querySelector<HTMLElement>("[autofocus], [data-autofocus]") ??
        el.querySelector<HTMLElement>(
          ".dialog-body input, .dialog-body select, .dialog-body textarea, .dialog-body button",
        );
      (target ?? el.querySelector<HTMLElement>("button"))?.focus();
    } else if (!open && el.open) {
      if (typeof el.close === "function") el.close();
      else el.removeAttribute("open");
      returnTo.current?.focus?.();
      returnTo.current = null;
    }
  }, [open]);

  // restore focus if unmounted while open
  useEffect(
    () => () => {
      returnTo.current?.focus?.();
    },
    [],
  );

  return (
    <dialog
      ref={ref}
      className={cx(s.dialog, wide && s.wide, className)}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
      onMouseDown={(e) => {
        if (dismissOnBackdrop && e.target === ref.current) onClose();
      }}
    >
      {open && (
        <>
          <header className={s.dialogHead}>
            <h2 id={titleId} className={s.dialogTitle}>
              {title}
            </h2>
            <IconButton icon={X} aria-label={t("ui.dialog.close")} onClick={onClose} size="sm" />
          </header>
          <div className={cx(s.dialogBody, "dialog-body")}>{children}</div>
          {footer && <footer className={s.dialogFoot}>{footer}</footer>}
        </>
      )}
    </dialog>
  );
}
