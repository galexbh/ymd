// Downloads left unfinished when ymd closed: resume them (they continue from their partial
// files) or discard them. The ones that had a video password or 2FA code cannot be resumed,
// because those were never stored: they are listed apart, to be pasted again in Recibir.
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { PendingJob } from "../../ipc/types";
import { Notice } from "../../ui";
import { needingSecret, resumable, usePending } from "../../store/pending";
import { SeqFigure } from "../shared/SeqFigure";
import s from "./queue.module.css";

function PendingList({ items }: { items: PendingJob[] }) {
  const { t } = useTranslation();
  return (
    <ul className={s.pendingList}>
      {items.map((p) => (
        <li key={p.id} className={s.pendingItem}>
          <SeqFigure seq={p.seq} />
          <span className={s.pendingTitle} title={p.url}>
            {p.title?.trim() || p.url || t("queue.pending.untitled")}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PendingNotice() {
  const { t } = useTranslation();
  const items = usePending((st) => st.items);
  const busy = usePending((st) => st.busy);

  useEffect(() => {
    void usePending.getState().load();
  }, []);

  const ready = resumable(items);
  const locked = needingSecret(items);
  if (items.length === 0) return null;

  return (
    <div className={s.pending} data-testid="queue-pending" aria-busy={busy || undefined}>
      {ready.length > 0 && (
        <Notice
          tone="info"
          title={t("queue.pending.title", { count: ready.length })}
          actions={[
            {
              label: t("queue.pending.resume"),
              primary: true,
              onClick: () => void usePending.getState().resumeAll(),
            },
            {
              label: t("queue.pending.discard"),
              onClick: () => void usePending.getState().discard(ready.map((p) => p.id)),
            },
          ]}
        >
          <p>{t("queue.pending.body")}</p>
          <PendingList items={ready} />
        </Notice>
      )}
      {locked.length > 0 && (
        <Notice
          tone="warning"
          title={t("queue.pending.secretTitle", { count: locked.length })}
          actions={[
            {
              label: t("queue.pending.discard"),
              onClick: () => void usePending.getState().discard(locked.map((p) => p.id)),
            },
          ]}
        >
          <p>{t("queue.pending.secretBody")}</p>
          <PendingList items={locked} />
        </Notice>
      )}
    </div>
  );
}
