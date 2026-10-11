import { FileArchive, FolderOpen, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, toCommandError } from "../../ipc/commands";
import type { UpdateChannel } from "../../ipc/types";
import {
  Button,
  Markdown,
  Notice,
  ProgressDeterminate,
  Section,
  SegmentedControl,
  Switch,
  useToasts,
} from "../../ui";
import { inTauri, useAppUpdate } from "../../store/appUpdate";
import { openExternal, openFile, osPlatform, showInFolder } from "../../app/native";
import { useDeps } from "../../store/deps";
import { useSettings } from "../../store/settings";
import screen from "../shared/screen.module.css";
import { FolderField } from "./DownloadsSettings";
import s from "./settings.module.css";

/** «Exportar diagnóstico»: the backend asks where to save the zip; null = cancelled. */
function useDiagnosticsExport() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const path = await api.diagnosticsExport();
      if (!path) return;
      useToasts.getState().push({
        tone: "success",
        title: t("settings.advanced.diagnostics.saved"),
        body: path,
        actions: [
          {
            label: t("ledger.action.reveal"),
            onClick: () => void showInFolder(path).catch(() => {}),
          },
        ],
      });
    } catch (e) {
      useToasts.getState().push({
        tone: "error",
        title: t("settings.advanced.diagnostics.failed"),
        body: toCommandError(e).detail,
      });
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

function AppUpdateSection() {
  const { t } = useTranslation();
  const u = useAppUpdate();
  const busy = u.status === "checking" || u.status === "downloading" || u.status === "installing";
  const native = inTauri();
  return (
    <Section title={t("settings.advanced.app.title")}>
      <p className={s.fieldHint}>
        {t("settings.advanced.app.current")}:{" "}
        <span className="figure">{u.current ?? t("settings.advanced.app.unknown")}</span>
      </p>
      <p className={s.fieldHint}>
        {native ? t("settings.advanced.app.hint") : t("settings.advanced.app.dev")}
      </p>
      <div className={screen.inline}>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={RefreshCw}
          loading={u.status === "checking"}
          disabled={!native || busy}
          onClick={() => void u.check()}
        >
          {u.status === "checking"
            ? t("settings.advanced.app.checking")
            : t("settings.advanced.app.check")}
        </Button>
        {u.status === "available" && (
          <Button size="sm" onClick={() => void u.install()}>
            {t("settings.advanced.app.install")}
          </Button>
        )}
      </div>
      {u.status === "upToDate" && (
        <p className={s.fieldHint}>{t("settings.advanced.app.upToDate")}</p>
      )}
      {u.status === "available" && (
        <Notice tone="info" title={t("settings.advanced.app.available", { version: u.version })}>
          {u.notes && (
            <div
              className={s.releaseNotes}
              tabIndex={0}
              role="region"
              aria-label={t("settings.advanced.app.notes", { version: u.version })}
              data-testid="app-update-notes"
            >
              <Markdown
                source={u.notes}
                onLink={(href) => void openExternal(href).catch(() => {})}
              />
            </div>
          )}
        </Notice>
      )}
      {(u.status === "downloading" || u.status === "installing") && (
        <ProgressDeterminate
          label={
            u.status === "installing"
              ? t("settings.advanced.app.installing")
              : t("settings.advanced.app.downloading")
          }
          value={u.downloaded}
          max={u.total}
        />
      )}
      {u.status === "noReleases" && (
        <p className={s.fieldHint} data-testid="app-update-no-releases">
          {t("settings.advanced.app.noReleases")}
        </p>
      )}
      {u.status === "error" &&
        (u.errorKind === "offline" ? (
          <Notice
            tone="warning"
            title={t("settings.advanced.app.offline")}
            detail={u.error ?? undefined}
          />
        ) : (
          <Notice
            tone="error"
            title={t("settings.advanced.app.failed")}
            detail={u.error ?? undefined}
          >
            {t("settings.advanced.app.failedHint")}
          </Notice>
        ))}
    </Section>
  );
}

function TraySection() {
  const { t } = useTranslation();
  const closeToTray = useSettings((st) => st.settings?.closeToTray ?? true);
  const update = useSettings((st) => st.update);
  const mac = osPlatform() === "macos";
  return (
    <Section title={t("settings.advanced.tray.title")}>
      <Switch
        checked={closeToTray}
        onChange={(v) => update({ closeToTray: v })}
        label={t(mac ? "settings.advanced.tray.keepMac" : "settings.advanced.tray.keep")}
        description={
          closeToTray
            ? t(mac ? "settings.advanced.tray.hintMac" : "settings.advanced.tray.hint")
            : t("settings.advanced.tray.off")
        }
      />
    </Section>
  );
}

export function AdvancedSettings() {
  const { t } = useTranslation();
  const settings = useSettings((st) => st.settings)!;
  const update = useSettings((st) => st.update);
  const binDir = useDeps((st) => st.report?.binDir);
  const diagnostics = useDiagnosticsExport();
  const setBinDir = (dir: string | null) => {
    update({ binDir: dir });
    // the tool report depends on where the tools live
    void useSettings
      .getState()
      .flush()
      .then(() => useDeps.getState().load());
  };

  return (
    <>
      <AppUpdateSection />
      <TraySection />
      <Section title={t("settings.advanced.ytdlp")}>
        <div className={s.fieldStack}>
          <span className={s.fieldLabel}>{t("settings.advanced.channel")}</span>
          <SegmentedControl<UpdateChannel>
            label={t("settings.advanced.channel")}
            value={settings.ytdlpChannel}
            onChange={(ytdlpChannel) => update({ ytdlpChannel })}
            options={[
              { value: "stable", label: t("settings.advanced.channels.stable") },
              { value: "nightly", label: t("settings.advanced.channels.nightly") },
              { value: "master", label: t("settings.advanced.channels.master") },
            ]}
          />
          <p className={s.fieldHint}>
            {t(`settings.advanced.channelHint.${settings.ytdlpChannel}`)}
          </p>
        </div>
        <Switch
          checked={settings.autoUpdate}
          onChange={(autoUpdate) => update({ autoUpdate })}
          label={t("settings.advanced.autoUpdate")}
          description={t("settings.advanced.autoUpdateHint")}
        />
      </Section>

      <Section title={t("settings.advanced.binDir")}>
        <FolderField
          label={t("settings.advanced.binDirLabel")}
          value={settings.binDir ?? binDir ?? ""}
          hint={
            settings.binDir
              ? t("settings.advanced.binDirCustom")
              : t("settings.advanced.binDirDefault")
          }
          onPick={(dir) => setBinDir(dir)}
        />
        <div className={screen.inline}>
          {settings.binDir && (
            <Button size="sm" variant="ghost" onClick={() => setBinDir(null)}>
              {t("settings.advanced.binDirReset")}
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={FolderOpen}
            onClick={async () => {
              // the backend's own data dir (Roaming on Windows), not a guess from the UI
              const dir = await api.appDataDir().catch(() => null);
              if (dir) await openFile(dir).catch(() => {});
            }}
          >
            {t("settings.advanced.openData")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={FileArchive}
            loading={diagnostics.busy}
            disabled={diagnostics.busy}
            onClick={() => void diagnostics.run()}
          >
            {t("settings.advanced.diagnostics.export")}
          </Button>
        </div>
        <p className={s.fieldHint}>{t("settings.advanced.diagnostics.hint")}</p>
      </Section>
    </>
  );
}
