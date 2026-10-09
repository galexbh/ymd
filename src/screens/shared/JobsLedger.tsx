import { Fragment, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FolderOpen,
  Inbox,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Job } from "../../ipc/types";
import {
  Accession,
  BytesFigure,
  EmptyState,
  ErrorNotice,
  EtaFigure,
  Figure,
  IconButton,
  Kbd,
  Ledger,
  LedgerBody,
  LedgerCell,
  LedgerHead,
  LedgerHeaderCell,
  LedgerRow,
  LedgerSpan,
  Notice,
  SpeedFigure,
  Stamp,
  Tag,
  Tooltip,
  formatBytes,
  formatPercent,
} from "../../ui";
import { currentLocale } from "../../i18n";
import { isActive, isTerminal, useJobs } from "../../store/jobs";
import { useSettings } from "../../store/settings";
import { openFile, showInFolder } from "../../app/native";
import { useErrorFixes } from "./errorFixes";
import { formatCode } from "./labels";
import s from "./jobs.module.css";
import screen from "./screen.module.css";

export interface JobsLedgerProps {
  jobs: Job[];
  caption: string;
  /** what to show when there are no rows */
  empty?: "teach" | "filtered";
}

export function JobsLedger({ jobs, caption, empty = "teach" }: JobsLedgerProps) {
  const { t } = useTranslation();
  if (jobs.length === 0) {
    return empty === "teach" ? (
      <EmptyState icon={Inbox} title={t("ledger.empty.title")}>
        <p>{t("ledger.empty.body")}</p>
        <p className={s.hint}>
          <Kbd>Ctrl</Kbd> <Kbd>V</Kbd> {t("ledger.empty.paste")}
        </p>
      </EmptyState>
    ) : (
      <p className={screen.muted}>{t("ledger.empty.filtered")}</p>
    );
  }
  return (
    <div className={s.container}>
      <Ledger caption={caption} data-testid="jobs-ledger">
        <LedgerHead>
          <tr>
            <LedgerHeaderCell className={s.cSeq}>{t("ledger.col.seq")}</LedgerHeaderCell>
            <LedgerHeaderCell className={s.cTitle}>{t("ledger.col.title")}</LedgerHeaderCell>
            <LedgerHeaderCell className={s.cFormat}>{t("ledger.col.format")}</LedgerHeaderCell>
            <LedgerHeaderCell numeric className={s.cSize}>
              {t("ledger.col.size")}
            </LedgerHeaderCell>
            <LedgerHeaderCell className={s.cSpan}>{t("ledger.col.progress")}</LedgerHeaderCell>
            <LedgerHeaderCell numeric className={s.cSpeed}>
              {t("ledger.col.speed")}
            </LedgerHeaderCell>
            <LedgerHeaderCell numeric className={s.cEta}>
              {t("ledger.col.eta")}
            </LedgerHeaderCell>
            <LedgerHeaderCell center className={s.cStamp}>
              {t("ledger.col.state")}
            </LedgerHeaderCell>
            <LedgerHeaderCell className={s.cActions}>
              <span className="visually-hidden">{t("ledger.col.actions")}</span>
            </LedgerHeaderCell>
          </tr>
        </LedgerHead>
        <LedgerBody>
          {jobs.map((j) => (
            <JobRow key={j.id} job={j} />
          ))}
        </LedgerBody>
      </Ledger>
    </div>
  );
}

const COLS = 9;

function JobRow({ job }: { job: Job }) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const preset = useSettings((st) => st.settings?.presets.find((p) => p.id === job.presetId));
  const actionError = useJobs((st) => st.actionErrors[job.id]);
  const { cancel, retry, remove } = useJobs.getState();
  const fixes = useErrorFixes();
  const [open, setOpen] = useState(true);
  const failed = job.stage === "error" && job.error;
  const playlist = job.playlistCount !== null && job.playlistCount > 1;
  const title = job.title ?? job.url;

  const fraction = playlist
    ? job.progress
    : job.totalBytes
      ? (job.downloadedBytes ?? 0) / job.totalBytes
      : null;
  const valueText =
    job.totalBytes != null
      ? `${formatBytes(job.downloadedBytes ?? 0, locale)} ${t("ui.progress.of")} ${formatBytes(job.totalBytes, locale)}`
      : undefined;
  const detailId = `job-detail-${job.id}`;

  return (
    <Fragment>
      <LedgerRow
        tone={failed ? "error" : job.stage === "canceled" ? "muted" : undefined}
        data-testid={`queue-item-${job.id}`}
        data-stage={job.stage}
      >
        <LedgerCell className={s.seqCell}>
          <Accession seq={job.seq} />
        </LedgerCell>
        <LedgerCell truncate title={title}>
          <span className={s.title}>{title}</span>
          {playlist && (
            <Figure
              className={s.part}
              value={`${job.playlistIndex ?? 1}/${job.playlistCount}`}
              aria-label={t("ledger.playlistPart", {
                index: job.playlistIndex ?? 1,
                count: job.playlistCount,
              })}
            />
          )}
        </LedgerCell>
        <LedgerCell className={s.cFormat}>
          <Tag mono>{formatCode(t, preset)}</Tag>
        </LedgerCell>
        <LedgerCell numeric className={s.cSize}>
          <BytesFigure bytes={job.totalBytes} muted={job.totalBytes == null} />
        </LedgerCell>
        <LedgerCell className={s.cSpan}>
          <div className={s.spanCell}>
            <LedgerSpan
              fraction={job.stage === "queued" ? 0 : fraction}
              stage={job.stage}
              label={t("ledger.progressOf", { title })}
              valueText={valueText}
            />
            <Figure
              className={s.pct}
              muted
              value={
                job.stage === "done" ? formatPercent(1, locale) : formatPercent(fraction, locale)
              }
            />
          </div>
        </LedgerCell>
        <LedgerCell numeric muted className={s.cSpeed}>
          {isActive(job.stage) ? <SpeedFigure bytesPerSecond={job.speed} /> : "—"}
        </LedgerCell>
        <LedgerCell numeric muted className={s.cEta}>
          {job.stage === "downloading" ? <EtaFigure seconds={job.eta} /> : "—"}
        </LedgerCell>
        <LedgerCell center>
          <Stamp stage={job.stage} size="sm" />
        </LedgerCell>
        <LedgerCell>
          <div className={screen.actionsCell}>
            {failed && (
              <Tooltip content={open ? t("ledger.hideDetail") : t("ledger.showDetail")}>
                <IconButton
                  icon={open ? ChevronUp : ChevronDown}
                  size="sm"
                  aria-label={open ? t("ledger.hideDetail") : t("ledger.showDetail")}
                  aria-expanded={open}
                  aria-controls={detailId}
                  onClick={() => setOpen(!open)}
                />
              </Tooltip>
            )}
            {!isTerminal(job.stage) && (
              <Tooltip content={t("ledger.action.cancel")}>
                <IconButton
                  icon={X}
                  size="sm"
                  aria-label={t("ledger.action.cancelNamed", { title })}
                  onClick={() => void cancel(job.id)}
                />
              </Tooltip>
            )}
            {(job.stage === "error" || job.stage === "canceled") && (
              <Tooltip content={t("common.retry")}>
                <IconButton
                  icon={RotateCcw}
                  size="sm"
                  aria-label={t("ledger.action.retryNamed", { title })}
                  onClick={() => void retry(job.id)}
                />
              </Tooltip>
            )}
            {job.stage === "done" && job.filepath && (
              <>
                <Tooltip content={t("ledger.action.open")}>
                  <IconButton
                    icon={ExternalLink}
                    size="sm"
                    aria-label={t("ledger.action.openNamed", { title })}
                    onClick={() => void openFile(job.filepath!).catch(() => {})}
                  />
                </Tooltip>
                <Tooltip content={t("ledger.action.reveal")}>
                  <IconButton
                    icon={FolderOpen}
                    size="sm"
                    aria-label={t("ledger.action.revealNamed", { title })}
                    onClick={() => void showInFolder(job.filepath!).catch(() => {})}
                  />
                </Tooltip>
              </>
            )}
            {isTerminal(job.stage) && (
              <Tooltip content={t("ledger.action.remove")}>
                <IconButton
                  icon={Trash2}
                  size="sm"
                  aria-label={t("ledger.action.removeNamed", { title })}
                  onClick={() => void remove(job.id)}
                />
              </Tooltip>
            )}
          </div>
        </LedgerCell>
      </LedgerRow>
      {failed && open && (
        <tr className={s.detailRow} id={detailId}>
          <td colSpan={COLS}>
            <ErrorNotice
              code={job.error!.code}
              detail={job.error!.detail}
              actions={fixes(job.error!.code, () => void retry(job.id))}
            />
          </td>
        </tr>
      )}
      {actionError && (
        <tr className={s.detailRow}>
          <td colSpan={COLS}>
            <Notice tone="warning" title={t("ledger.actionFailed")} detail={actionError.detail} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}
