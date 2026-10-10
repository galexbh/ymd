// «Extensión de ymd para Brave, Chrome y Edge»: the cookie bridge card in Ajustes → Cuentas.
// It polls `extension_status` while mounted, walks the user through the one-time install and
// switches the cookie source to the synced file when the first sync arrives.
import { useEffect, useId, useRef, useState, type Ref } from "react";
import { Copy, ExternalLink, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../ipc/commands";
import type { Browser, ExtensionStatus, ExtensionSync } from "../../ipc/types";
import { Button, Figure, Notice, Stamp, formatStampDate } from "../../ui";
import { currentLocale } from "../../i18n";
import { copyText, openFile } from "../../app/native";
import { useSettings } from "../../store/settings";
import { BROWSER_NAMES } from "../shared/errorFixes";
import { EXTENSION_POLL_MS, STAMP, bridgeState, pageBrowser, syncBrowserName } from "./extension";
import s from "./ExtensionCard.module.css";
import settings from "./settings.module.css";

function syncTime(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(currentLocale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export interface ExtensionCardProps {
  /** Windows with a Chromium browser: the card leads the cookie remedies */
  prominent: boolean;
  /** called whenever a new sync lands (the cookie copy changed) */
  onSynced?: () => void;
  ref?: Ref<HTMLElement>;
}

export function ExtensionCard({ prominent, onSynced, ref }: ExtensionCardProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const folderHintId = useId();
  const source = useSettings((st) => st.settings?.cookies ?? null);
  const update = useSettings((st) => st.update);
  const [status, setStatus] = useState<ExtensionStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [first, setFirst] = useState<{ sync: ExtensionSync; switched: boolean } | null>(null);
  const [openError, setOpenError] = useState<Browser | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointer = useRef(false);
  const onSyncedRef = useRef(onSynced);
  useEffect(() => {
    onSyncedRef.current = onSynced;
  });

  // poll every 5 s and on window focus; nothing runs after unmount
  useEffect(() => {
    let alive = true;
    let busy = false;
    const refresh = () => {
      if (busy) return;
      busy = true;
      api
        .extensionStatus()
        .then((st) => {
          if (!alive) return;
          setStatus(st);
          setFailed(false);
        })
        .catch(() => {
          if (alive) setFailed(true);
        })
        .finally(() => {
          busy = false;
        });
    };
    refresh();
    const id = window.setInterval(refresh, EXTENSION_POLL_MS);
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener("focus", refresh);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  // first sync (null → set): adopt the synced file as the cookie source
  const lastSeen = useRef<ExtensionSync | null | undefined>(undefined);
  useEffect(() => {
    if (!status) return;
    const prev = lastSeen.current;
    const next = status.lastSync;
    lastSeen.current = next;
    if (prev === undefined || !next || prev?.at === next.at) return;
    if (prev === null) {
      const current = useSettings.getState().settings?.cookies;
      const switched = current?.kind !== "file";
      if (switched) update({ cookies: { kind: "file" } });
      setFirst({ sync: next, switched });
    }
    onSyncedRef.current?.();
  }, [status, update]);

  const state = status ? bridgeState(status) : null;
  const chosen = source?.kind === "browser" ? source.browser : null;
  const target = status ? pageBrowser(status, chosen) : "brave";
  const targetName = BROWSER_NAMES[target];
  const sync = status?.lastSync ?? null;
  const locale = currentLocale();

  const openPage = async () => {
    setOpenError(null);
    try {
      await api.extensionOpenPage(target);
    } catch {
      setOpenError(target);
    }
  };

  return (
    <section
      ref={ref}
      tabIndex={-1}
      className={s.card}
      aria-labelledby={titleId}
      data-testid="extension-card"
      data-prominent={prominent || undefined}
      data-state={state ?? undefined}
      onPointerDown={() => {
        pointer.current = true;
      }}
      onFocus={(e) => {
        if (e.target === e.currentTarget && !pointer.current) {
          e.currentTarget.dataset.ring = "true";
        }
        pointer.current = false;
      }}
      onBlur={(e) => {
        delete e.currentTarget.dataset.ring;
      }}
    >
      <div className={s.head}>
        <h3 id={titleId} className={s.title}>
          {t("extension.title")}
        </h3>
        {state && (
          <Stamp
            stage={STAMP[state]}
            label={t(`extension.state.${state}`)}
            date={sync ? formatStampDate(sync.at, locale) : undefined}
            dateTime={sync?.at}
            data-testid="extension-stamp"
          />
        )}
      </div>
      <p className={s.lead}>{t("extension.lead")}</p>

      {failed && !status && <p className={s.muted}>{t("extension.status.unavailable")}</p>}

      {state && (
        <p className={state === "noBridge" ? s.warn : s.muted} data-testid="extension-status">
          {t(`extension.status.${state}`, {
            browser: sync ? syncBrowserName(sync.browser) : targetName,
          })}
        </p>
      )}

      {sync && (
        <dl className={settings.facts} data-testid="extension-sync">
          <div>
            <dt>{t("extension.fact.browser")}</dt>
            <dd>{syncBrowserName(sync.browser)}</dd>
          </div>
          <div>
            <dt>{t("extension.fact.lastSync")}</dt>
            <dd>
              <Figure value={syncTime(sync.at)} />
            </dd>
          </div>
          <div>
            <dt>{t("extension.fact.cookies")}</dt>
            <dd>
              <Figure value={sync.cookieCount} />
            </dd>
          </div>
        </dl>
      )}

      {first && (
        <Notice
          tone="success"
          title={t("extension.synced", {
            browser: syncBrowserName(first.sync.browser),
            count: first.sync.cookieCount,
          })}
          onDismiss={() => setFirst(null)}
        >
          {first.switched ? t("extension.syncedBody") : undefined}
        </Notice>
      )}

      {status && (
        <>
          <h4 className={s.stepsTitle}>{t("extension.steps")}</h4>
          <ol className={s.steps}>
            <li>
              <span>{t("extension.step1")}</span>
              <div className={s.stepAction}>
                <Button
                  size="sm"
                  variant="secondary"
                  leadingIcon={FolderOpen}
                  disabled={!status.extensionDir}
                  aria-describedby={status.extensionDir ? undefined : folderHintId}
                  onClick={() => {
                    if (status.extensionDir) void openFile(status.extensionDir).catch(() => {});
                  }}
                  data-testid="extension-open-folder"
                >
                  {t("extension.openFolder")}
                </Button>
                {!status.extensionDir && (
                  <span id={folderHintId} className={s.hint}>
                    {t("extension.noFolder")}
                  </span>
                )}
              </div>
            </li>
            <li>
              <span>{t("extension.step2", { browser: targetName })}</span>
              <div className={s.stepAction}>
                <Button
                  size="sm"
                  variant="secondary"
                  leadingIcon={ExternalLink}
                  onClick={() => void openPage()}
                  data-testid="extension-open-page"
                >
                  {t("extension.openPage", { browser: targetName })}
                </Button>
              </div>
            </li>
            <li>{t("extension.step3")}</li>
            <li>{t("extension.step4")}</li>
          </ol>
          {openError && (
            <Notice
              tone="warning"
              title={t("extension.openFailed", { browser: BROWSER_NAMES[openError] })}
              onDismiss={() => setOpenError(null)}
            >
              {t("extension.openFailedHint", {
                browser: BROWSER_NAMES[openError],
                url: `${openError}://extensions`,
              })}
            </Notice>
          )}
          <div className={s.idRow}>
            <span className={s.idLabel}>{t("extension.id")}</span>
            <code className={s.id} data-testid="extension-id">
              {status.extensionId}
            </code>
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={Copy}
              onClick={async () => {
                const ok = await copyText(status.extensionId);
                setCopied(ok);
                if (copiedTimer.current) clearTimeout(copiedTimer.current);
                copiedTimer.current = setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? t("common.copied") : t("common.copy")}
            </Button>
            <span className={s.hint}>{t("extension.idHint")}</span>
          </div>
        </>
      )}
    </section>
  );
}
