import { useTranslation } from "react-i18next";
import type { Language } from "../../ipc/types";
import { Section, SegmentedControl } from "../../ui";
import { useSettings } from "../../store/settings";
import s from "./settings.module.css";

export function LanguageSettings() {
  const { t } = useTranslation();
  const language = useSettings((st) => st.settings!.language);
  const update = useSettings((st) => st.update);
  return (
    <Section
      title={t("appearance.language.label")}
      description={t("settings.language.description")}
    >
      <div className={s.fieldStack}>
        <SegmentedControl<Language>
          label={t("appearance.language.label")}
          value={language}
          onChange={(lang) => update({ language: lang })}
          options={[
            { value: "system", label: t("appearance.language.system") },
            { value: "es", label: t("appearance.language.es") },
            { value: "en", label: t("appearance.language.en") },
          ]}
        />
      </div>
    </Section>
  );
}
