import { useState } from "react";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AudioFormat, MediaKind, Preset, VideoContainer } from "../../ipc/types";
import {
  Button,
  Checkbox,
  IconButton,
  Ledger,
  LedgerBody,
  LedgerCell,
  LedgerHead,
  LedgerHeaderCell,
  LedgerRow,
  Section,
  SegmentedControl,
  Select,
  Tag,
  TextField,
  Tooltip,
  useToasts,
} from "../../ui";
import { newPresetId, useSettings } from "../../store/settings";
import { formatCode, presetName } from "../shared/labels";
import screen from "../shared/screen.module.css";
import { FolderField } from "./DownloadsSettings";
import s from "./settings.module.css";

import { SPONSORBLOCK_CATEGORIES } from "./constants";

const HEIGHTS = ["", "2160", "1440", "1080", "720", "480", "360"];
const CONTAINERS: VideoContainer[] = ["any", "mp4", "mkv", "webm"];
const AUDIO_FORMATS: AudioFormat[] = ["best", "mp3", "m4a", "opus", "flac"];
const QUALITIES = ["0", "2", "5", "320K", "256K", "192K", "128K"];

function blankPreset(id: string, name: string): Preset {
  return {
    id,
    name,
    kind: "video",
    video: { maxHeight: 1080, container: "mp4" },
    audio: { format: "mp3", quality: "320K" },
    postprocess: {
      embedThumbnail: true,
      embedMetadata: true,
      embedSubs: false,
      subLangs: "es,en",
      sponsorblockRemove: [],
    },
    outputDir: null,
    builtin: false,
  };
}

export function PresetsSettings() {
  const { t } = useTranslation();
  const settings = useSettings((st) => st.settings)!;
  const update = useSettings((st) => st.update);
  const [draft, setDraft] = useState<{ preset: Preset; isNew: boolean; isDefault: boolean } | null>(
    null,
  );

  const edit = (p: Preset) =>
    setDraft({
      preset: structuredClone(p),
      isNew: false,
      isDefault: settings.defaultPresetId === p.id,
    });
  const duplicate = (p: Preset) => {
    const id = newPresetId(settings.presets);
    setDraft({
      preset: {
        ...structuredClone(p),
        id,
        name: t("settings.presets.copyOf", { name: presetName(t, p) }),
        builtin: false,
      },
      isNew: true,
      isDefault: false,
    });
  };
  const create = () =>
    setDraft({
      preset: blankPreset(newPresetId(settings.presets), t("settings.presets.newName")),
      isNew: true,
      isDefault: false,
    });

  const remove = (p: Preset) => {
    const before = settings;
    update((x) => ({
      ...x,
      presets: x.presets.filter((q) => q.id !== p.id),
      defaultPresetId: x.defaultPresetId === p.id ? "best" : x.defaultPresetId,
    }));
    if (draft?.preset.id === p.id) setDraft(null);
    useToasts.getState().push({
      tone: "info",
      title: t("settings.presets.deleted", { name: p.name }),
      actions: [{ label: t("settings.presets.undo"), onClick: () => update(() => before) }],
    });
  };

  const save = () => {
    if (!draft) return;
    const p = { ...draft.preset, name: draft.preset.name.trim() || draft.preset.id };
    update((x) => {
      const exists = x.presets.some((q) => q.id === p.id);
      return {
        ...x,
        presets: exists ? x.presets.map((q) => (q.id === p.id ? p : q)) : [...x.presets, p],
        defaultPresetId: draft.isDefault
          ? p.id
          : x.defaultPresetId === p.id
            ? "best"
            : x.defaultPresetId,
      };
    });
    setDraft(null);
  };

  return (
    <>
      <Section
        title={t("settings.section.presets")}
        description={t("settings.presets.description")}
        actions={
          <Button size="sm" variant="secondary" leadingIcon={Plus} onClick={create}>
            {t("settings.presets.new")}
          </Button>
        }
      >
        <Ledger caption={t("settings.section.presets")}>
          <LedgerHead>
            <tr>
              <LedgerHeaderCell>{t("settings.presets.col.name")}</LedgerHeaderCell>
              <LedgerHeaderCell className={s.cKind}>
                {t("settings.presets.col.kind")}
              </LedgerHeaderCell>
              <LedgerHeaderCell className={s.cFormat}>
                {t("settings.presets.col.format")}
              </LedgerHeaderCell>
              <LedgerHeaderCell className={s.cPresetActions}>
                <span className="visually-hidden">{t("ledger.col.actions")}</span>
              </LedgerHeaderCell>
            </tr>
          </LedgerHead>
          <LedgerBody>
            {settings.presets.map((p) => (
              <LedgerRow
                key={p.id}
                selected={draft?.preset.id === p.id}
                data-testid={`preset-row-${p.id}`}
              >
                <LedgerCell truncate>
                  <span className={s.presetName}>{presetName(t, p)}</span>
                  {settings.defaultPresetId === p.id && (
                    <Tag tone="accent" className={s.inlineTag}>
                      {t("settings.presets.default")}
                    </Tag>
                  )}
                  {p.builtin && <Tag className={s.inlineTag}>{t("settings.presets.builtin")}</Tag>}
                </LedgerCell>
                <LedgerCell muted>
                  {p.kind === "video" ? t("receive.video") : t("receive.audio")}
                </LedgerCell>
                <LedgerCell>
                  <Tag mono>{formatCode(t, p)}</Tag>
                </LedgerCell>
                <LedgerCell>
                  <div className={screen.actionsCell}>
                    <Tooltip content={t("settings.presets.edit")}>
                      <IconButton
                        icon={Pencil}
                        size="sm"
                        aria-label={t("settings.presets.editNamed", { name: presetName(t, p) })}
                        onClick={() => edit(p)}
                      />
                    </Tooltip>
                    <Tooltip content={t("settings.presets.duplicate")}>
                      <IconButton
                        icon={Copy}
                        size="sm"
                        aria-label={t("settings.presets.duplicateNamed", {
                          name: presetName(t, p),
                        })}
                        onClick={() => duplicate(p)}
                      />
                    </Tooltip>
                    {!p.builtin && (
                      <Tooltip content={t("settings.presets.delete")}>
                        <IconButton
                          icon={Trash2}
                          size="sm"
                          aria-label={t("settings.presets.deleteNamed", { name: p.name })}
                          onClick={() => remove(p)}
                        />
                      </Tooltip>
                    )}
                  </div>
                </LedgerCell>
              </LedgerRow>
            ))}
          </LedgerBody>
        </Ledger>
      </Section>

      {draft && (
        <PresetEditor
          key={draft.preset.id}
          draft={draft.preset}
          isNew={draft.isNew}
          isDefault={draft.isDefault}
          onChange={(preset) => setDraft({ ...draft, preset })}
          onDefault={(isDefault) => setDraft({ ...draft, isDefault })}
          onSave={save}
          onCancel={() => setDraft(null)}
        />
      )}
    </>
  );
}

function PresetEditor({
  draft,
  isNew,
  isDefault,
  onChange,
  onDefault,
  onSave,
  onCancel,
}: {
  draft: Preset;
  isNew: boolean;
  isDefault: boolean;
  onChange: (p: Preset) => void;
  onDefault: (on: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const locked = draft.builtin;
  const pp = draft.postprocess;
  const setPP = (patch: Partial<Preset["postprocess"]>) =>
    onChange({ ...draft, postprocess: { ...pp, ...patch } });

  return (
    <Section
      title={
        isNew
          ? t("settings.presets.creating")
          : t("settings.presets.editing", { name: presetName(t, draft) })
      }
      description={locked ? t("settings.presets.builtinLocked") : undefined}
      data-testid="preset-editor"
    >
      <div className={s.formGrid}>
        <TextField
          label={t("settings.presets.name")}
          value={locked ? presetName(t, draft) : draft.name}
          disabled={locked}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
        <div className={s.fieldStack}>
          <span className={s.fieldLabel}>{t("settings.presets.col.kind")}</span>
          <SegmentedControl<MediaKind>
            label={t("settings.presets.col.kind")}
            value={draft.kind}
            disabled={locked}
            onChange={(kind) => onChange({ ...draft, kind })}
            options={[
              { value: "video", label: t("receive.video") },
              { value: "audio", label: t("receive.audio") },
            ]}
          />
        </div>
        {draft.kind === "video" ? (
          <>
            <Select
              label={t("settings.presets.maxHeight")}
              disabled={locked}
              value={draft.video.maxHeight ? String(draft.video.maxHeight) : ""}
              onChange={(e) =>
                onChange({
                  ...draft,
                  video: {
                    ...draft.video,
                    maxHeight: e.target.value ? Number(e.target.value) : null,
                  },
                })
              }
              options={HEIGHTS.map((h) => ({
                value: h,
                label: h ? `${h}p` : t("settings.presets.noLimit"),
              }))}
            />
            <Select
              label={t("settings.presets.container")}
              disabled={locked}
              value={draft.video.container}
              onChange={(e) =>
                onChange({
                  ...draft,
                  video: { ...draft.video, container: e.target.value as VideoContainer },
                })
              }
              options={CONTAINERS.map((c) => ({
                value: c,
                label: c === "any" ? t("settings.presets.containerAny") : c.toUpperCase(),
              }))}
            />
          </>
        ) : (
          <>
            <Select
              label={t("settings.presets.audioFormat")}
              disabled={locked}
              value={draft.audio.format}
              onChange={(e) =>
                onChange({
                  ...draft,
                  audio: { ...draft.audio, format: e.target.value as AudioFormat },
                })
              }
              options={AUDIO_FORMATS.map((f) => ({
                value: f,
                label: f === "best" ? t("settings.presets.audioBest") : f.toUpperCase(),
              }))}
            />
            <Select
              label={t("settings.presets.audioQuality")}
              disabled={locked || draft.audio.format === "best"}
              value={draft.audio.quality}
              onChange={(e) =>
                onChange({ ...draft, audio: { ...draft.audio, quality: e.target.value } })
              }
              options={QUALITIES.map((q) => ({
                value: q,
                label: q.endsWith("K")
                  ? `${q.slice(0, -1)} kbps`
                  : t("settings.presets.vbr", { n: q }),
              }))}
            />
          </>
        )}
      </div>

      <div className={s.checks}>
        <Checkbox
          checked={pp.embedThumbnail}
          onCheckedChange={(embedThumbnail) => setPP({ embedThumbnail })}
          label={t("settings.presets.embedThumbnail")}
        />
        <Checkbox
          checked={pp.embedMetadata}
          onCheckedChange={(embedMetadata) => setPP({ embedMetadata })}
          label={t("settings.presets.embedMetadata")}
        />
        <Checkbox
          checked={pp.embedSubs}
          onCheckedChange={(embedSubs) => setPP({ embedSubs })}
          label={t("settings.presets.embedSubs")}
        />
      </div>
      {pp.embedSubs && (
        <TextField
          label={t("settings.presets.subLangs")}
          hint={t("settings.presets.subLangsHint")}
          mono
          value={pp.subLangs}
          onChange={(e) => setPP({ subLangs: e.target.value })}
        />
      )}

      <fieldset className={s.fieldset}>
        <legend className={s.fieldLabel}>{t("settings.presets.sponsorblock")}</legend>
        <p className={s.fieldHint}>{t("settings.presets.sponsorblockHint")}</p>
        <div className={s.checks}>
          {SPONSORBLOCK_CATEGORIES.map((c) => (
            <Checkbox
              key={c}
              checked={pp.sponsorblockRemove.includes(c)}
              onCheckedChange={(on) =>
                setPP({
                  sponsorblockRemove: on
                    ? [...pp.sponsorblockRemove, c]
                    : pp.sponsorblockRemove.filter((x) => x !== c),
                })
              }
              label={t(`settings.presets.sb.${c}`)}
              description={c}
            />
          ))}
        </div>
      </fieldset>

      <FolderField
        label={t("settings.presets.outputDir")}
        value={draft.outputDir ?? ""}
        hint={draft.outputDir ? undefined : t("settings.presets.outputDirDefault")}
        onPick={(outputDir) => onChange({ ...draft, outputDir })}
      />
      {draft.outputDir && (
        <div>
          <Button size="sm" variant="ghost" onClick={() => onChange({ ...draft, outputDir: null })}>
            {t("settings.presets.outputDirReset")}
          </Button>
        </div>
      )}

      <Checkbox
        checked={isDefault}
        onCheckedChange={onDefault}
        label={t("settings.presets.makeDefault")}
      />

      <div className={screen.inline}>
        <Button variant="primary" onClick={onSave} data-testid="preset-save">
          {t("settings.presets.save")}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </Section>
  );
}
