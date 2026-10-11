import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ClipboardWatch } from "../../ipc/types";
import { Button, Figure, SegmentedControl, Section, Select, Switch, TextField } from "../../ui";
import { pickFolder } from "../../app/native";
import { depById, isPresent, useDeps } from "../../store/deps";
import { useSettings } from "../../store/settings";
import { RATE_PRESETS, isRatePreset, parseRate } from "./constants";
import { renderTemplate, templateHasExt } from "./template";
import s from "./settings.module.css";

export function FolderField({
  label,
  value,
  onPick,
  hint,
  testId,
}: {
  label: string;
  value: string;
  onPick: (dir: string) => void;
  hint?: string;
  testId?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={s.folderField}>
      <TextField
        label={label}
        mono
        readOnly
        value={value}
        hint={hint}
        data-testid={testId}
        fieldClassName={s.grow}
      />
      <Button
        variant="secondary"
        leadingIcon={FolderOpen}
        className={s.folderButton}
        onClick={async () => {
          try {
            const dir = await pickFolder(value);
            if (dir) onPick(dir);
          } catch {
            // picker unavailable
          }
        }}
      >
        {t("settings.choose")}
      </Button>
    </div>
  );
}

const RATE_NONE = "none";
const RATE_OTHER = "other";

/** «Límite de velocidad»: common caps, or «Otro…» with a numeric field (saved debounced). */
function SpeedLimitField() {
  const { t } = useTranslation();
  const limit = useSettings((st) => st.settings!.limitRateMbps);
  const update = useSettings((st) => st.update);
  // «Otro…» stays chosen while typing, even before the number is valid
  const [other, setOther] = useState(() => limit !== null && !isRatePreset(limit));
  const [draft, setDraft] = useState<string | null>(null);
  const showOther = other || (limit !== null && !isRatePreset(limit));
  const value = showOther ? RATE_OTHER : limit === null ? RATE_NONE : String(limit);
  const text = draft ?? (limit === null ? "" : String(limit));
  const invalid = showOther && text.trim() !== "" && parseRate(text) === null;

  return (
    <div className={s.fieldStack}>
      <Select
        label={t("settings.downloads.limitRate")}
        hint={t("settings.downloads.limitRateHint")}
        value={value}
        data-testid="settings-limit-rate"
        onChange={(e) => {
          const v = e.target.value;
          setDraft(null);
          if (v === RATE_OTHER) {
            setOther(true);
            return;
          }
          setOther(false);
          update({ limitRateMbps: v === RATE_NONE ? null : Number(v) });
        }}
        options={[
          { value: RATE_NONE, label: t("settings.downloads.limitRateNone") },
          ...RATE_PRESETS.map((n) => ({
            value: String(n),
            label: t("settings.downloads.limitRateValue", { n }),
          })),
          { value: RATE_OTHER, label: t("settings.downloads.limitRateOther") },
        ]}
      />
      {showOther && (
        <TextField
          label={t("settings.downloads.limitRateCustom")}
          mono
          inputMode="numeric"
          autoComplete="off"
          value={text}
          trailing="MB/s"
          error={invalid ? t("settings.downloads.limitRateInvalid") : undefined}
          data-testid="settings-limit-rate-custom"
          onChange={(e) => {
            setDraft(e.target.value);
            const n = parseRate(e.target.value);
            if (n !== null) update({ limitRateMbps: n }, { debounce: 500 });
          }}
        />
      )}
    </div>
  );
}

export function DownloadsSettings() {
  const { t } = useTranslation();
  const settings = useSettings((st) => st.settings)!;
  const update = useSettings((st) => st.update);
  const aria2 = useDeps((st) => depById(st.report, "aria2c"));
  // local draft while typing; invalid drafts are never saved
  const [draft, setTemplate] = useState<string | null>(null);
  const template = draft ?? settings.filenameTemplate;

  const aria2Ready = isPresent(aria2);
  const templateError = !template.trim()
    ? t("settings.downloads.templateEmpty")
    : !templateHasExt(template)
      ? t("settings.downloads.templateExt")
      : undefined;

  return (
    <>
      <Section title={t("settings.downloads.folders")}>
        <FolderField
          label={t("settings.downloads.videoDir")}
          value={settings.videoDir}
          onPick={(videoDir) => update({ videoDir })}
          testId="settings-video-dir"
        />
        <FolderField
          label={t("settings.downloads.audioDir")}
          value={settings.audioDir}
          onPick={(audioDir) => update({ audioDir })}
        />
        <Switch
          checked={settings.askEachTime}
          onChange={(askEachTime) => update({ askEachTime })}
          label={t("settings.downloads.askEachTime")}
          description={t("settings.downloads.askEachTimeHint")}
        />
      </Section>

      <Section title={t("settings.downloads.naming")}>
        <TextField
          label={t("settings.downloads.template")}
          mono
          value={template}
          error={templateError}
          hint={t("settings.downloads.templateHint")}
          onChange={(e) => {
            setTemplate(e.target.value);
            if (e.target.value.trim() && templateHasExt(e.target.value)) {
              update({ filenameTemplate: e.target.value }, { debounce: 500 });
            }
          }}
        />
        <p className={s.example}>
          <span className={s.exampleLabel}>{t("settings.downloads.example")}</span>
          <code className={s.exampleValue} data-testid="template-example">
            {renderTemplate(template)}
          </code>
        </p>
      </Section>

      <Section title={t("settings.downloads.queue")}>
        <div className={s.slider}>
          <label htmlFor="concurrency" className={s.sliderLabel}>
            {t("settings.downloads.concurrency")}
          </label>
          <input
            id="concurrency"
            type="range"
            min={1}
            max={8}
            step={1}
            value={settings.concurrency}
            aria-describedby="concurrency-hint"
            onChange={(e) => update({ concurrency: Number(e.target.value) }, { debounce: 300 })}
          />
          <Figure value={settings.concurrency} className={s.sliderValue} />
          <p id="concurrency-hint" className={s.sliderHint}>
            {t("settings.downloads.concurrencyHint")}
          </p>
        </div>
        <Switch
          checked={settings.useDownloadArchive}
          onChange={(useDownloadArchive) => update({ useDownloadArchive })}
          label={t("settings.downloads.archive")}
          description={t("settings.downloads.archiveHint")}
        />
        <Switch
          checked={settings.useAria2c && aria2Ready}
          disabled={!aria2Ready}
          onChange={(useAria2c) => update({ useAria2c })}
          label={t("settings.downloads.aria2c")}
          description={
            aria2Ready ? t("settings.downloads.aria2cHint") : t("settings.downloads.aria2cMissing")
          }
        />
        <SpeedLimitField />
        <Switch
          checked={settings.notifyDownloads}
          onChange={(notifyDownloads) => update({ notifyDownloads })}
          label={t("settings.downloads.notify")}
          description={t("settings.downloads.notifyHint")}
        />
      </Section>

      <Section title={t("settings.downloads.clipboard")}>
        <div className={s.fieldStack}>
          <span className={s.fieldLabel}>{t("settings.downloads.clipboardWatch")}</span>
          <SegmentedControl<ClipboardWatch>
            label={t("settings.downloads.clipboardWatch")}
            value={settings.clipboardWatch}
            onChange={(clipboardWatch) => update({ clipboardWatch })}
            options={[
              { value: "off", label: t("settings.downloads.clipboardModes.off") },
              { value: "known", label: t("settings.downloads.clipboardModes.known") },
              { value: "any", label: t("settings.downloads.clipboardModes.any") },
            ]}
          />
          <p className={s.fieldHint}>
            {t(`settings.downloads.clipboardHint.${settings.clipboardWatch}`)}
          </p>
          <p className={s.fieldHint}>{t("settings.downloads.clipboardPrivacy")}</p>
        </div>
      </Section>
    </>
  );
}
