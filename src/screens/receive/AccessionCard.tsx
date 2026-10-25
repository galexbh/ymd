import { memo, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProbeResult } from "../../ipc/types";
import { ChevronRight } from "lucide-react";
import { Accession, DurationFigure, Figure, Icon, Tag, TextField, Thumb } from "../../ui";
import { api } from "../../ipc/commands";
import { useJobs } from "../../store/jobs";
import { clipAvailable, useReceive } from "../../store/receive";
import { useSettings } from "../../store/settings";
import { presetName } from "../shared/labels";
import { formatClipRange, formatClock, validateClip } from "./clip";
import { activePreset, destinationFor } from "./ingest";
import { PlaylistPicker } from "./PlaylistPicker";
import s from "./receive.module.css";

/** The accession card: what was handed over, and where it will be filed. Memoized so the
 * ledger below changing never re-renders it (nor the playlist grid inside). */
export const AccessionCard = memo(function AccessionCard({ probe }: { probe: ProbeResult }) {
  const { t } = useTranslation();
  const titleId = useId();
  const settings = useSettings((st) => st.settings);
  const kind = useReceive((st) => st.kind);
  const chosen = useReceive((st) => st.presetByKind[kind]);
  // the backend hands out accession numbers (continuing from the archive); re-ask whenever
  // the ledger gains a row
  const filed = useJobs((st) => Object.keys(st.jobs).length);
  const [seq, setSeq] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .jobsNextSeq()
      .then((n) => alive && setSeq(n))
      .catch(() => alive && setSeq(null));
    return () => {
      alive = false;
    };
  }, [probe.url, filed]);
  const preset = activePreset(settings, kind, chosen);
  const playlist = probe.kind === "playlist";

  return (
    <article className={s.card} aria-labelledby={titleId} data-testid="accession-card">
      <div className={s.cardMain}>
        <Thumb src={probe.thumbnail} width="100%" className={s.cardThumb} />
        <div className={s.cardBody}>
          <div className={s.cardHead}>
            <span className={s.nextSeq}>
              {seq !== null ? (
                <>
                  <span className={s.cardLabel}>{t("receive.card.willFile")}</span>
                  <Accession seq={seq} data-testid="next-accession" />
                </>
              ) : (
                <span className={s.cardLabel}>{t("receive.card.seqOnFile")}</span>
              )}
            </span>
          </div>
          <h2 id={titleId} className={s.cardTitle}>
            {probe.title}
          </h2>
          {probe.uploader && <p className={s.cardUploader}>{probe.uploader}</p>}
          <dl className={s.facts}>
            <div>
              <dt>{t("receive.card.duration")}</dt>
              <dd>
                <DurationFigure seconds={probe.duration} />
              </dd>
            </div>
            {playlist ? (
              <div>
                <dt>{t("receive.card.entries")}</dt>
                <dd>
                  <Figure value={probe.entries.length} />
                </dd>
              </div>
            ) : (
              <div>
                <dt>{t("receive.card.best")}</dt>
                <dd>
                  <Figure value={probe.maxHeight ? `${probe.maxHeight}p` : "—"} />
                </dd>
              </div>
            )}
            <div>
              <dt>{t("receive.card.site")}</dt>
              <dd>
                <Tag mono>{probe.extractor ?? "—"}</Tag>
              </dd>
            </div>
            <div>
              <dt>{t("receive.card.preset")}</dt>
              <dd>{preset ? presetName(t, preset) : "—"}</dd>
            </div>
            <div className={s.factWide}>
              <dt>{t("receive.card.shelf")}</dt>
              <dd className={s.shelf}>
                {settings?.askEachTime
                  ? t("receive.card.askEachTime")
                  : settings
                    ? destinationFor(settings, preset)
                    : "—"}
              </dd>
            </div>
          </dl>
          {clipAvailable(probe) && <ClipFields key={probe.url} duration={probe.duration!} />}
          <OneOffOptions />
        </div>
      </div>
      {playlist && <PlaylistPicker probe={probe} />}
    </article>
  );
});

/**
 * «Tramo»: download only a time range of the video (empty = the whole video). A disclosure,
 * closed until a range is typed; an invalid range keeps it open so the field error that blocks
 * Descargar is never hidden.
 */
function ClipFields({ duration }: { duration: number }) {
  const { t } = useTranslation();
  const titleId = useId();
  const clipStart = useReceive((st) => st.clipStart);
  const clipEnd = useReceive((st) => st.clipEnd);
  const check = validateClip(clipStart, clipEnd, duration);
  const setClip = useReceive((st) => st.setClip);
  const [open, setOpen] = useState(() => Boolean(clipStart.trim() || clipEnd.trim()));
  const invalid = check.error !== null;
  const error = invalid ? t(check.error!, { duration: formatClock(duration) }) : null;
  return (
    <details
      className={s.options}
      open={open || invalid}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      data-testid="clip-fields"
    >
      <summary
        // an invalid range cannot be folded away: its error is what blocks Descargar
        onClick={(e) => invalid && e.preventDefault()}
        data-locked={invalid || undefined}
        data-testid="clip-summary"
      >
        <Icon icon={ChevronRight} size={14} className={s.summaryIcon} />
        <span id={titleId}>{t("receive.clip.title")}</span>
        {/* a word break for text and accessible name; the flex gap does the spacing */}
        {check.clip && " "}
        {check.clip && (
          <span className={s.summaryRange} data-testid="clip-summary-range">
            <span aria-hidden="true">·</span> {formatClipRange(check.clip)}
          </span>
        )}
      </summary>
      <div role="group" aria-labelledby={titleId} className={s.optionsBody}>
        <div className={s.clipFields}>
          <TextField
            label={t("receive.clip.start")}
            mono
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder="0:00"
            value={clipStart}
            error={check.field === "start" ? error : undefined}
            onChange={(e) => setClip("clipStart", e.target.value)}
            data-testid="clip-start"
          />
          <TextField
            label={t("receive.clip.end")}
            mono
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder={formatClock(duration)}
            value={clipEnd}
            error={check.field === "end" ? error : undefined}
            onChange={(e) => setClip("clipEnd", e.target.value)}
            data-testid="clip-end"
          />
        </div>
        <p className={s.optionsHint}>{t("receive.clip.hint")}</p>
      </div>
    </details>
  );
}

function OneOffOptions() {
  const { t } = useTranslation();
  const videoPassword = useReceive((st) => st.videoPassword);
  const twofactor = useReceive((st) => st.twofactor);
  const setSecret = useReceive((st) => st.setSecret);
  return (
    <details className={s.options}>
      <summary>
        <Icon icon={ChevronRight} size={14} className={s.summaryIcon} />
        {t("receive.options.title")}
      </summary>
      <div className={s.optionsBody}>
        <p className={s.optionsHint}>{t("receive.options.hint")}</p>
        <div className={s.optionsFields}>
          <TextField
            label={t("receive.options.videoPassword")}
            type="password"
            autoComplete="off"
            optional
            value={videoPassword}
            onChange={(e) => setSecret("videoPassword", e.target.value)}
          />
          <TextField
            label={t("receive.options.twofactor")}
            inputMode="numeric"
            autoComplete="one-time-code"
            optional
            mono
            value={twofactor}
            onChange={(e) => setSecret("twofactor", e.target.value)}
          />
        </div>
      </div>
    </details>
  );
}
