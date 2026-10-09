import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProbeResult } from "../../ipc/types";
import { ChevronRight } from "lucide-react";
import { Accession, DurationFigure, Figure, Icon, Tag, TextField, Thumb } from "../../ui";
import { api } from "../../ipc/commands";
import { useJobs } from "../../store/jobs";
import { useReceive } from "../../store/receive";
import { useSettings } from "../../store/settings";
import { presetName } from "../shared/labels";
import { activePreset, destinationFor } from "./ingest";
import { PlaylistPicker } from "./PlaylistPicker";
import s from "./receive.module.css";

/** The accession card: what was handed over, and where it will be filed. */
export function AccessionCard({ probe }: { probe: ProbeResult }) {
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
          <OneOffOptions />
        </div>
      </div>
      {playlist && <PlaylistPicker probe={probe} />}
    </article>
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
