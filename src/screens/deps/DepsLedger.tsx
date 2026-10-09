import { Fragment, useState } from "react";
import { Copy, Download, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DepPhase, DepStatus } from "../../ipc/types";
import {
  Button,
  Figure,
  Ledger,
  LedgerBody,
  LedgerCell,
  LedgerHead,
  LedgerHeaderCell,
  LedgerRow,
  Notice,
  ProgressDeterminate,
  Stamp,
  Tag,
} from "../../ui";
import { copyText } from "../../app/native";
import { useDeps } from "../../store/deps";
import { jobTotals, useJobs } from "../../store/jobs";
import { DEP_NAMES } from "../shared/labels";
import screen from "../shared/screen.module.css";
import s from "./deps.module.css";

export interface DepsLedgerProps {
  deps: DepStatus[];
  /** onboarding: no remove/update, no "latest" column */
  compact?: boolean;
  caption: string;
}

export function DepsLedger({ deps, compact, caption }: DepsLedgerProps) {
  const { t } = useTranslation();
  const cols = compact ? 4 : 5;
  return (
    <div className={s.container}>
      <Ledger caption={caption} data-testid="deps-ledger">
        <LedgerHead>
          <tr>
            <LedgerHeaderCell>{t("deps.col.tool")}</LedgerHeaderCell>
            <LedgerHeaderCell className={s.cState}>{t("deps.col.state")}</LedgerHeaderCell>
            <LedgerHeaderCell className={s.cVersion}>{t("deps.col.version")}</LedgerHeaderCell>
            {!compact && (
              <LedgerHeaderCell className={s.cCheck}>{t("deps.col.check")}</LedgerHeaderCell>
            )}
            <LedgerHeaderCell className={s.cActions}>
              <span className="visually-hidden">{t("ledger.col.actions")}</span>
            </LedgerHeaderCell>
          </tr>
        </LedgerHead>
        <LedgerBody>
          {deps.map((d) => (
            <DepRow key={d.id} dep={d} compact={compact} cols={cols} />
          ))}
        </LedgerBody>
      </Ledger>
    </div>
  );
}

function DepRow({ dep, compact, cols }: { dep: DepStatus; compact?: boolean; cols: number }) {
  const { t } = useTranslation();
  const busy = useDeps((st) => st.busy[dep.id]);
  const progress = useDeps((st) => st.progress[dep.id]);
  const error = useDeps((st) => st.errors[dep.id]);
  const installingAll = useDeps((st) => st.installingAll);
  const pendingJobs = useJobs((st) => {
    const x = jobTotals(st.jobs);
    return x.active + x.queued;
  });
  const [copied, setCopied] = useState(false);
  const { install, remove } = useDeps.getState();

  // "install everything" runs server-side: live progress events are the signal
  const live = !!progress && progress.phase !== "done" && progress.phase !== "error";
  const installing = dep.state === "installing" || busy === "install" || live;
  const present = !live && (dep.state === "installed" || dep.state === "system");
  const ytdlpLocked = dep.id === "ytdlp" && pendingJobs > 0;
  const name = DEP_NAMES[dep.id];
  const showProgress = live;

  const stamp = installing
    ? { stage: "downloading" as const, label: t("deps.state.installing") }
    : dep.state === "installed"
      ? { stage: "done" as const, label: t("deps.state.installed") }
      : dep.state === "system"
        ? { stage: "merging" as const, label: t("deps.state.system") }
        : dep.state === "error"
          ? { stage: "error" as const, label: t("deps.state.error") }
          : { stage: "queued" as const, label: t("deps.state.missing") };

  return (
    <Fragment>
      <LedgerRow
        data-testid={`deps-row-${dep.id}`}
        tone={dep.state === "error" ? "error" : undefined}
      >
        <LedgerCell>
          <div className={s.tool}>
            <span className={s.toolName}>
              {name}
              <Tag className={s.level} data-level={dep.level}>
                {t(`deps.level.${dep.level}`)}
              </Tag>
            </span>
            <span className={s.toolDesc}>{t(`deps.desc.${dep.id}`)}</span>
          </div>
        </LedgerCell>
        <LedgerCell>
          <Stamp stage={stamp.stage} label={stamp.label} size="sm" />
        </LedgerCell>
        <LedgerCell>
          <div className={s.version}>
            {present && dep.version ? (
              <Figure value={dep.version} />
            ) : (
              <span className={screen.muted}>—</span>
            )}
            {dep.state === "system" && dep.path && (
              <span className={s.depPath} title={dep.path}>
                {dep.path}
              </span>
            )}
            {!compact && dep.latest && (dep.updateAvailable || !present) && (
              <span className={s.latest}>
                {dep.updateAvailable && <Tag tone="warning">{t("deps.updateAvailable")}</Tag>}
                <span className={screen.muted}>{t("deps.latest")}</span>
                <Figure value={dep.latest} />
              </span>
            )}
          </div>
        </LedgerCell>
        {!compact && (
          <LedgerCell className={s.cCheck}>
            {present ? (
              dep.verified ? (
                <Tag tone="accent">{t("deps.verified")}</Tag>
              ) : (
                <Tag>{t("deps.unverified")}</Tag>
              )
            ) : (
              <span className={screen.muted}>—</span>
            )}
          </LedgerCell>
        )}
        <LedgerCell>
          <div className={s.actions}>
            {!present && dep.canInstall && (
              <Button
                size="sm"
                variant={dep.level === "required" ? "primary" : "secondary"}
                leadingIcon={Download}
                loading={installing}
                disabled={installingAll && !installing}
                data-testid={`deps-install-${dep.id}`}
                onClick={() => void install(dep.id)}
              >
                {dep.state === "error" ? t("common.retry") : t("deps.install")}
              </Button>
            )}
            {!compact && present && dep.updateAvailable && dep.state === "installed" && (
              <Button
                size="sm"
                variant="primary"
                leadingIcon={RefreshCw}
                loading={installing}
                disabled={ytdlpLocked}
                data-testid={`deps-update-${dep.id}`}
                onClick={() => void install(dep.id)}
              >
                {t("deps.update")}
              </Button>
            )}
            {!compact &&
              present &&
              dep.updateAvailable &&
              dep.state === "system" &&
              dep.canInstall && (
                <Button
                  size="sm"
                  variant="primary"
                  leadingIcon={Download}
                  disabled={ytdlpLocked}
                  data-testid={`deps-install-managed-${dep.id}`}
                  onClick={() => void install(dep.id)}
                >
                  {t("deps.installManaged")}
                </Button>
              )}
            {!compact && dep.state === "installed" && (
              <Button
                size="sm"
                variant="ghost"
                leadingIcon={Trash2}
                loading={busy === "remove"}
                disabled={installing || ytdlpLocked}
                data-testid={`deps-remove-${dep.id}`}
                onClick={() => void remove(dep.id)}
              >
                {t("common.remove")}
              </Button>
            )}
          </div>
        </LedgerCell>
      </LedgerRow>
      {showProgress && (
        <tr className={s.sub}>
          <td colSpan={cols}>
            <ProgressDeterminate
              label={t(`deps.phase.${progress.phase as Exclude<DepPhase, "done" | "error">}`, {
                name,
              })}
              value={progress.received}
              max={progress.total}
            />
            {progress.message && <p className={s.subNote}>{progress.message}</p>}
          </td>
        </tr>
      )}
      {!compact && ytdlpLocked && (dep.updateAvailable || dep.state === "installed") && (
        <tr className={s.sub}>
          <td colSpan={cols}>
            <p className={s.subNote}>{t("deps.ytdlpLocked", { n: pendingJobs })}</p>
          </td>
        </tr>
      )}
      {!compact && present && dep.updateAvailable && dep.state === "system" && dep.canInstall && (
        <tr className={s.sub}>
          <td colSpan={cols}>
            <p className={s.subNote}>
              {t("deps.systemOutdated", { name, version: dep.version ?? "?" })}
            </p>
          </td>
        </tr>
      )}
      {error && !installing && (
        <tr className={s.sub}>
          <td colSpan={cols}>
            <Notice
              tone="error"
              title={t("deps.failed", { name })}
              detail={error.detail}
              actions={
                dep.canInstall
                  ? [
                      {
                        label: t("common.retry"),
                        primary: true,
                        onClick: () => void install(dep.id),
                      },
                    ]
                  : undefined
              }
            >
              {t("deps.failedHint")}
            </Notice>
          </td>
        </tr>
      )}
      {!present && !dep.canInstall && dep.manualHint && (
        <tr className={s.sub}>
          <td colSpan={cols}>
            <div className={s.manual}>
              <span>{t("deps.manual")}</span>
              <code className={s.code}>{dep.manualHint}</code>
              <Button
                size="sm"
                variant="ghost"
                leadingIcon={Copy}
                onClick={async () => {
                  setCopied(await copyText(dep.manualHint!));
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? t("common.copied") : t("common.copy")}
              </Button>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
