// «Extensión de ymd para Brave, Chrome y Edge»: the cookie bridge card in Ajustes → Cuentas.
// It polls `extension_status` while mounted, walks the user through the one-time install and
// switches the cookie source to the synced file when the first sync arrives.
import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from "react";
import { Copy, ExternalLink, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../ipc/commands";
import type { Browser, ExtensionStatus, ExtensionSync } from "../../ipc/types";
import { Button, Figure, Notice, Stamp, formatStampDate } from "../../ui";
import { currentLocale } from "../../i18n";
import { copyText, openFile } from "../../app/native";
import { useSettings } from "../../store/settings";
import { BROWSER_NAMES } from "../shared/errorFixes";
import {
  EXTENSION_POLL_MS,
  STAMP,
  bridgeState,
  extensionsUrl,
  pageBrowser,
  syncBrowserName,
} from "./extension";
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

function StepsFrame({
  folded,
  title,
  children,
}: {
  folded: boolean;
  title: string;
  children: ReactNode;
}) {
  if (!folded) {
    return (
      <>
        <h4 className={s.stepsTitle}>{title}</h4>
        {children}
      </>
    );
  }
  return (
    <details className={s.stepsFold} data-testid="extension-steps-fold">
      <summary className={s.stepsTitle}>{title}</summary>
      {children}
    </details>
  );
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
  const [opened, setOpened] = useState<{ browser: Browser; copied: boolean } | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
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

  // Chromium won't open brave://extensions for another program: copy it, then bring the
  // browser up so the user pastes it.
  const openPage = async () => {
    setOpenError(null);
    setOpened(null);
    const copied = await copyText(extensionsUrl(target));
    try {
      await api.extensionOpenPage(target);
      setOpened({ browser: target, copied });
    } catch {
      setOpenError(target);
    }
  };

  const openFolder = async (dir: string) => {
    setFolderError(null);
    try {
      await openFile(dir);
    } catch {
      setFolderError(dir);
    }
  };

  const defaultIsFirefox = status?.defaultBrowser === "firefox";

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

      {defaultIsFirefox && (
        <div data-testid="extension-firefox-default">
          <Notice
            tone="info"
            title={t("extension.firefoxDefault")}
            actions={
              source?.kind === "browser" && source.browser === "firefox"
                ? undefined
                : [
                    {
                      label: t("extension.useFirefox"),
                      primary: true,
                      onClick: () =>
                        update({ cookies: { kind: "browser", browser: "firefox", profile: null } }),
                    },
                  ]
            }
          >
            {t("extension.firefoxDefaultBody")}
          </Notice>
        </div>
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
          {/* Once connected the setup is history: fold it away for a second browser. */}
          <StepsFrame folded={!!sync} title={t(sync ? "extension.stepsOther" : "extension.steps")}>
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
                      if (status.extensionDir) void openFolder(status.extensionDir);
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
                <span>
                  {t("extension.step2", { browser: targetName })}{" "}
                  <code className={s.url}>{extensionsUrl(target)}</code>
                </span>
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
          </StepsFrame>
          {folderError && (
            <Notice
              tone="warning"
              title={t("extension.folderFailed")}
              detail={folderError}
              onDismiss={() => setFolderError(null)}
            >
              {t("extension.folderFailedHint")}
            </Notice>
          )}
          {opened && (
            <div data-testid="extension-opened">
              <Notice
                tone="info"
                title={t("extension.openedTitle", { browser: BROWSER_NAMES[opened.browser] })}
                onDismiss={() => setOpened(null)}
              >
                {t(opened.copied ? "extension.openedCopied" : "extension.openedType", {
                  url: extensionsUrl(opened.browser),
                })}
              </Notice>
            </div>
          )}
          {openError && (
            <Notice
              tone="warning"
              title={t("extension.openFailed", { browser: BROWSER_NAMES[openError] })}
              onDismiss={() => setOpenError(null)}
            >
              {t("extension.openFailedHint", {
                browser: BROWSER_NAMES[openError],
                url: extensionsUrl(openError),
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
