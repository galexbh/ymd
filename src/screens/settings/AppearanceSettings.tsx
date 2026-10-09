import { useState } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Density, Radius, ThemeMode, ThemeSettings } from "../../ipc/types";
import {
  Accession,
  Button,
  Figure,
  Icon,
  LedgerSpan,
  Section,
  SegmentedControl,
  Stamp,
  TextField,
} from "../../ui";
import { CURATED_ACCENTS, deriveAccent, isHex, normalizeHex } from "../../theme/accent";
import { FONT_SCALE_MAX, FONT_SCALE_MIN } from "../../theme/applyTheme";
import { useResolvedTheme, useTheme } from "../../theme/useTheme";
import { useSettings } from "../../store/settings";
import s from "./settings.module.css";

export function AppearanceSettings() {
  const { t } = useTranslation();
  const settings = useSettings((st) => st.settings)!;
  const update = useSettings((st) => st.update);
  const resolved = useResolvedTheme();
  const adjusted = useTheme((st) => st.accentAdjusted);
  const theme = settings.theme;
  const curated = CURATED_ACCENTS.find((a) => a.hex === (theme.accent ?? CURATED_ACCENTS[0].hex));
  const [custom, setCustom] = useState(curated ? "" : (theme.accent ?? ""));
  const customValid = isHex(custom) && /^#?[0-9a-f]{6}$/i.test(custom.trim());

  const setTheme = (patch: Partial<ThemeSettings>, debounce?: number) =>
    update((x) => ({ ...x, theme: { ...x.theme, ...patch } }), { debounce });

  return (
    <>
      <Section title={t("appearance.title")}>
        <div className={s.fieldStack}>
          <span className={s.fieldLabel}>{t("appearance.theme.label")}</span>
          <SegmentedControl<ThemeMode>
            label={t("appearance.theme.label")}
            value={theme.mode}
            onChange={(mode) => setTheme({ mode })}
            options={[
              { value: "system", label: t("appearance.theme.system") },
              { value: "light", label: t("appearance.theme.light") },
              { value: "dark", label: t("appearance.theme.dark") },
            ]}
          />
        </div>

        <div className={s.fieldStack}>
          <span className={s.fieldLabel} id="accent-label">
            {t("appearance.accent.label")}
          </span>
          <div role="radiogroup" aria-labelledby="accent-label" className={s.swatches}>
            {CURATED_ACCENTS.map((a) => {
              const on = curated?.id === a.id && !custom;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={s.swatch}
                  style={{ background: a[resolved] }}
                  title={t(`appearance.accent.names.${a.id as "violet"}`)}
                  data-testid={`settings-accent-${a.id}`}
                  onClick={() => {
                    setCustom("");
                    setTheme({ accent: a.id === "violet" ? null : a.hex });
                  }}
                >
                  <span className="visually-hidden">
                    {t(`appearance.accent.names.${a.id as "violet"}`)}
                  </span>
                  {on && <Icon icon={Check} size={14} className={s.swatchCheck} />}
                </button>
              );
            })}
          </div>
          <div className={s.customAccent}>
            <TextField
              label={t("appearance.accent.custom")}
              mono
              value={custom}
              placeholder="#5b3fc4"
              maxLength={7}
              error={custom && !customValid ? t("appearance.accent.invalid") : undefined}
              hint={t("appearance.accent.customHint")}
              onChange={(e) => {
                const v = e.target.value;
                setCustom(v);
                if (/^#?[0-9a-f]{6}$/i.test(v.trim())) {
                  setTheme({ accent: normalizeHex(v.startsWith("#") ? v : `#${v}`) }, 300);
                }
              }}
            />
            {customValid && (
              <span
                className={s.customChip}
                style={{ background: deriveAccent(normalizeHex(custom), resolved).accent }}
                aria-hidden="true"
              />
            )}
          </div>
          {adjusted && theme.accent && (
            <p className={s.fieldHint}>{t("appearance.accent.adjusted")}</p>
          )}
          {theme.accent && (
            <div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCustom("");
                  setTheme({ accent: null });
                }}
              >
                {t("appearance.accent.reset")}
              </Button>
            </div>
          )}
        </div>

        <div className={s.twoCol}>
          <div className={s.fieldStack}>
            <span className={s.fieldLabel}>{t("appearance.density.label")}</span>
            <SegmentedControl<Density>
              label={t("appearance.density.label")}
              value={theme.density}
              onChange={(density) => setTheme({ density })}
              options={[
                { value: "comfortable", label: t("appearance.density.comfortable") },
                { value: "compact", label: t("appearance.density.compact") },
              ]}
            />
          </div>
          <div className={s.fieldStack}>
            <span className={s.fieldLabel}>{t("appearance.radius.label")}</span>
            <SegmentedControl<Radius>
              label={t("appearance.radius.label")}
              value={theme.radius}
              onChange={(radius) => setTheme({ radius })}
              options={[
                { value: "sharp", label: t("appearance.radius.sharp") },
                { value: "soft", label: t("appearance.radius.soft") },
                { value: "round", label: t("appearance.radius.round") },
              ]}
            />
          </div>
        </div>

        <div className={s.slider}>
          <label htmlFor="font-scale" className={s.sliderLabel}>
            {t("appearance.fontScale.label")}
          </label>
          <input
            id="font-scale"
            type="range"
            min={FONT_SCALE_MIN}
            max={FONT_SCALE_MAX}
            step={0.025}
            value={theme.fontScale}
            aria-describedby="font-scale-hint"
            onChange={(e) => setTheme({ fontScale: Number(e.target.value) }, 300)}
          />
          <Figure value={`${Math.round(theme.fontScale * 100)} %`} className={s.sliderValue} />
          <p id="font-scale-hint" className={s.sliderHint}>
            {t("appearance.fontScale.hint")}
          </p>
        </div>
      </Section>

      <Section title={t("settings.appearance.preview")}>
        <div className={s.preview} data-testid="appearance-preview" aria-hidden="true">
          <Accession seq={128} />
          <span className={s.previewTitle}>{t("settings.appearance.previewTitle")}</span>
          <LedgerSpan fraction={0.62} />
          <Figure value="8,4" unit="MiB/s" muted />
          <Stamp stage="downloading" size="sm" />
          <Stamp stage="done" size="sm" />
          <Button variant="primary" size="sm" tabIndex={-1}>
            {t("receive.ingest")}
          </Button>
        </div>
      </Section>
    </>
  );
}
