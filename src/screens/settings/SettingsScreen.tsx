import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Icon, Skeleton } from "../../ui";
import { SETTINGS_SECTIONS, useNav, type SettingsSection } from "../../store/nav";
import { useSettings } from "../../store/settings";
import { ScreenHeader } from "../shared/ScreenHeader";
import screen from "../shared/screen.module.css";
import { AccountsSettings } from "./AccountsSettings";
import { AdvancedSettings } from "./AdvancedSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { DownloadsSettings } from "./DownloadsSettings";
import { LanguageSettings } from "./LanguageSettings";
import { PresetsSettings } from "./PresetsSettings";
import s from "./settings.module.css";

const SECTION: Record<SettingsSection, () => JSX.Element> = {
  downloads: DownloadsSettings,
  presets: PresetsSettings,
  accounts: AccountsSettings,
  appearance: AppearanceSettings,
  language: LanguageSettings,
  advanced: AdvancedSettings,
};

export function SaveIndicator() {
  const { t } = useTranslation();
  const status = useSettings((st) => st.status);
  const flush = useSettings((st) => st.flush);
  const update = useSettings((st) => st.update);
  if (status === "idle") return <span className={screen.saveState} />;
  return (
    <span className={screen.saveState} data-state={status} role="status" data-testid="save-state">
      {status === "saving" && <Icon icon={LoaderCircle} size={14} />}
      {status === "saved" && <Icon icon={Check} size={14} />}
      {status === "error" && <Icon icon={CircleAlert} size={14} />}
      {t(`settings.save.${status}`)}
      {status === "error" && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            update((x) => x);
            void flush();
          }}
        >
          {t("common.retry")}
        </Button>
      )}
    </span>
  );
}

export function SettingsScreen() {
  const { t } = useTranslation();
  const section = useNav((n) => n.section);
  const navigate = useNav((n) => n.navigate);
  const settings = useSettings((st) => st.settings);
  const Body = SECTION[section];

  return (
    <div className={screen.screen}>
      <ScreenHeader title={t("nav.settings")} actions={<SaveIndicator />} />
      <div className={s.layout}>
        <nav className={s.tabs} aria-label={t("settings.sections")}>
          <ul>
            {SETTINGS_SECTIONS.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  className={s.tab}
                  aria-current={section === id ? "page" : undefined}
                  data-testid={`settings-tab-${id}`}
                  data-keep-focus
                  onClick={() => navigate("settings", id)}
                >
                  {t(`settings.section.${id}`)}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className={s.body}>{settings ? <Body /> : <Skeleton variant="text" count={6} />}</div>
      </div>
    </div>
  );
}
