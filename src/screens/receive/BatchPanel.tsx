import { useEffect, useId } from "react";
import { useTranslation } from "react-i18next";
import { MAX_BATCH_LINKS } from "../../app/clipboardLink";
import { Button, Kbd, Switch, Tag } from "../../ui";
import { useReceive, type Batch } from "../../store/receive";
import { useSettings } from "../../store/settings";
import { presetName } from "../shared/labels";
import { activePreset, destinationFor, focusUrlField, ingestBatch } from "./ingest";
import s from "./receive.module.css";

/** Excluded tokens listed by name; the rest are only counted. */
const SHOWN_INVALID = 10;

function cancelBatch() {
  useReceive.getState().reset();
  focusUrlField();
}

/** Enter files the batch and Esc drops it, unless focus is on a control that owns the key. */
function onBatchKey(e: KeyboardEvent) {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const target = e.target instanceof Element ? e.target : null;
  if (target?.closest("dialog, [role='dialog']")) return;
  if (e.key === "Escape") {
    e.preventDefault();
    cancelBatch();
  } else if (e.key === "Enter") {
    // buttons, switches and selects act on their own; a link typed into the counter is
    // ingested by its form as usual
    if (target?.closest("button, select, textarea, a, summary, [role='switch']")) return;
    if (target instanceof HTMLInputElement && target.type !== "radio" && target.value.trim()) {
      return;
    }
    e.preventDefault();
    void ingestBatch();
  }
}

/** The multi-link panel: every pasted link, filed together with one preset and shelf. */
export function BatchPanel({ batch }: { batch: Batch }) {
  const { t } = useTranslation();
  const titleId = useId();
  const settings = useSettings((st) => st.settings);
  const kind = useReceive((st) => st.kind);
  const chosen = useReceive((st) => st.presetByKind[kind]);
  const wholePlaylists = useReceive((st) => st.wholePlaylists);
  const enqueueing = useReceive((st) => st.enqueueing);
  const setWholePlaylists = useReceive((st) => st.setWholePlaylists);
  const preset = activePreset(settings, kind, chosen);
  const count = batch.links.length;
  const shownInvalid = batch.invalid.slice(0, SHOWN_INVALID);

  useEffect(() => {
    window.addEventListener("keydown", onBatchKey);
    return () => window.removeEventListener("keydown", onBatchKey);
  }, []);

  return (
    <section className={s.card} aria-labelledby={titleId} data-testid="batch-panel">
      <div className={s.batchBody}>
        <div className={s.cardHead}>
          <span className={s.cardLabel}>{t("receive.batch.label")}</span>
        </div>
        <h2 id={titleId} className={s.cardTitle}>
          {t("receive.batch.title", { count })}
        </h2>

        <ol className={s.batchList} aria-label={t("receive.batch.listLabel")}>
          {batch.links.map((url, i) => (
            <li key={url} className={s.batchItem} data-testid="batch-link">
              <span className={s.batchNo}>{String(i + 1).padStart(2, "0")}</span>
              <span className={s.batchUrl} title={url}>
                {url}
              </span>
            </li>
          ))}
          {shownInvalid.map((token) => (
            <li
              key={`x:${token}`}
              className={s.batchItem}
              data-excluded="true"
              data-testid="batch-excluded"
            >
              <span className={s.batchNo} aria-hidden="true">
                —
              </span>
              <del className={s.batchUrl} title={token}>
                {token}
              </del>
              <Tag tone="warning">{t("receive.batch.excluded")}</Tag>
            </li>
          ))}
        </ol>

        {(batch.invalid.length > 0 || batch.overflow > 0) && (
          <div className={s.batchNotes} role="note">
            {batch.invalid.length > 0 && (
              <p>{t("receive.batch.invalidNote", { count: batch.invalid.length })}</p>
            )}
            {batch.overflow > 0 && (
              <p>
                {t("receive.batch.overflowNote", { count: batch.overflow, max: MAX_BATCH_LINKS })}
              </p>
            )}
          </div>
        )}

        <dl className={s.facts}>
          <div>
            <dt>{t("receive.card.preset")}</dt>
            <dd>{preset ? presetName(t, preset) : "—"}</dd>
          </div>
          <div className={s.factWide}>
            <dt>{t("receive.card.shelf")}</dt>
            <dd className={s.shelf}>
              {settings?.askEachTime
                ? t("receive.batch.askOnce")
                : settings
                  ? destinationFor(settings, preset)
                  : "—"}
            </dd>
          </div>
        </dl>

        <Switch
          checked={wholePlaylists}
          onChange={setWholePlaylists}
          label={t("receive.batch.wholePlaylists")}
          description={t("receive.batch.wholePlaylistsHint")}
        />

        <div className={s.batchActions}>
          <p className={s.batchKeys}>
            <Kbd>{t("receive.batch.enterKey")}</Kbd> {t("receive.batch.enterHint")}
            <span className={s.dot}>·</span>
            <Kbd>Esc</Kbd> {t("receive.batch.escHint")}
          </p>
          <Button variant="ghost" onClick={cancelBatch} disabled={enqueueing}>
            {t("receive.batch.cancel")}
          </Button>
          <Button
            variant="primary"
            loading={enqueueing}
            disabled={!settings || !preset}
            onClick={() => void ingestBatch()}
            data-testid="batch-enqueue"
          >
            {t("receive.batch.enqueue", { count })}
          </Button>
        </div>
      </div>
    </section>
  );
}
