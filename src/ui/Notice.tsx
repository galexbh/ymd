import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import type { ErrorCode } from "../ipc/types";
import s from "./Overlay.module.css";
import { Button, IconButton } from "./Button";
import { cx } from "./cx";
import { Icon } from "./Icon";

export type NoticeTone = "info" | "success" | "warning" | "error";

const TONE_ICON: Record<NoticeTone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
};

export interface NoticeAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

export interface NoticeProps {
  tone?: NoticeTone;
  title: ReactNode;
  children?: ReactNode;
  /** raw technical detail, shown small in mono (never the only content) */
  detail?: string;
  actions?: NoticeAction[];
  onDismiss?: () => void;
  className?: string;
  /** announce politely (default) or assertively (errors) */
  live?: boolean;
}

/** Inline message with an optional next step; errors name the recovery. */
export function Notice({ tone = "info", title, children, detail, actions, onDismiss, className, live = true }: NoticeProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cx(s.notice, s[tone], className)}
      role={live ? (tone === "error" ? "alert" : "status") : undefined}
    >
      <Icon icon={TONE_ICON[tone]} size={18} />
      <div className={s.noticeText}>
        <p className={s.noticeTitle}>{title}</p>
        {children && <div className={s.noticeBody}>{children}</div>}
        {detail && <p className={s.noticeDetail}>{detail}</p>}
        {actions && actions.length > 0 && (
          <div className={s.noticeActions}>
            {actions.map((a) => (
              <Button key={a.label} size="sm" variant={a.primary ? (tone === "error" ? "secondary" : "primary") : "ghost"} onClick={a.onClick}>
                {a.label}
              </Button>
            ))}
          </div>
        )}
      </div>
      {onDismiss ? <IconButton icon={X} size="sm" className={s.noticeClose} aria-label={t("ui.notice.dismiss")} onClick={onDismiss} /> : <span />}
    </div>
  );
}

/** Notice for an IPC/job error: translated title + next step, raw detail below. */
export function ErrorNotice({ code, detail, actions, onDismiss, className }: { code: ErrorCode; detail?: string; actions?: NoticeAction[]; onDismiss?: () => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <Notice tone="error" title={t(`error.${code}.title`)} detail={detail} actions={actions} onDismiss={onDismiss} className={className}>
      {t(`error.${code}.action`)}
    </Notice>
  );
}

// ───────────── toasts ─────────────

export interface Toast {
  id: number;
  tone: NoticeTone;
  title: string;
  body?: string;
  actions?: NoticeAction[];
  /** ms; errors stay until dismissed */
  timeout?: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { ...toast, id }].slice(-4) });
    const timeout = toast.timeout ?? (toast.tone === "error" ? 0 : 5000);
    if (timeout > 0) setTimeout(() => get().dismiss(id), timeout);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));

/** Mount once near the app root. */
export function ToastRegion() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className={s.toastRegion} aria-live="polite" aria-relevant="additions">
      {toasts.map((x) => (
        <Notice
          key={x.id}
          tone={x.tone}
          title={x.title}
          live={false}
          className={s.toast}
          onDismiss={() => dismiss(x.id)}
          actions={x.actions?.map((a) => ({
            ...a,
            onClick: () => {
              a.onClick();
              dismiss(x.id);
            },
          }))}
        >
          {x.body}
        </Notice>
      ))}
    </div>
  );
}
