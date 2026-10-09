import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { UpdateChannel } from "../../ipc/types";
import { Button, Section, SegmentedControl, Switch } from "../../ui";
import { openFile, parentDir } from "../../app/native";
import { useDeps } from "../../store/deps";
import { useSettings } from "../../store/settings";
import screen from "../shared/screen.module.css";
import { FolderField } from "./DownloadsSettings";
import s from "./settings.module.css";

async function dataDir(fallback: string | undefined): Promise<string | null> {
  try {
    const { appLocalDataDir } = await import("@tauri-apps/api/path");
    const dir = await appLocalDataDir();
    if (dir) return dir;
  } catch {
    // not available outside Tauri
  }
  return fallback ? parentDir(fallback) : null;
}

export function AdvancedSettings() {
  const { t } = useTranslation();
  const settings = useSettings((st) => st.settings)!;
  const update = useSettings((st) => st.update);
  const binDir = useDeps((st) => st.report?.binDir);
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
              const dir = await dataDir(binDir);
              if (dir) await openFile(dir).catch(() => {});
            }}
          >
            {t("settings.advanced.openData")}
          </Button>
        </div>
      </Section>
    </>
  );
}
