import { Download, FolderOpen, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Notice, Section, Skeleton } from "../../ui";
import { pickFolder } from "../../app/native";
import { recommendedMissing, requiredReady, useDeps } from "../../store/deps";
import { useNav } from "../../store/nav";
import { useSettings } from "../../store/settings";
import { DepsLedger } from "../deps/DepsLedger";
import { ScreenHeader } from "../shared/ScreenHeader";
import screen from "../shared/screen.module.css";
import { focusUrlField } from "../receive/ingest";
import s from "./onboarding.module.css";

/** First run: one calm page inside the shell, not a wizard. */
export function OnboardingScreen() {
  const { t } = useTranslation();
  const report = useDeps((st) => st.report);
  const installingAll = useDeps((st) => st.installingAll);
  const allError = useDeps((st) => st.allError);
  const settings = useSettings((st) => st.settings);
  const update = useSettings((st) => st.update);
  const { installRecommended } = useDeps.getState();

  const needed = report?.deps.filter(
    (d) =>
      d.level === "required" || (d.id === "deno" && (!report.jsRuntime || d.state === "installed")),
  );
  const missing = recommendedMissing(report);
  const ready = requiredReady(report);

  const finish = () => {
    update({ onboarded: true });
    useNav.getState().navigate("receive");
    focusUrlField();
  };

  const choose = async (field: "videoDir" | "audioDir") => {
    if (!settings) return;
    try {
      const dir = await pickFolder(settings[field]);
      if (dir) update({ [field]: dir });
    } catch {
      // picker closed or unavailable
    }
  };

  return (
    <div className={`${screen.screen} ${s.onboarding}`} data-testid="onboarding">
      <ScreenHeader title={t("onboarding.title")} description={t("onboarding.lead")} />

      <Section
        title={t("onboarding.tools.title")}
        description={t("onboarding.tools.body")}
        actions={
          ready ? (
            <span className={s.ok}>{t("onboarding.tools.ready")}</span>
          ) : (
            <Button
              variant="primary"
              leadingIcon={Download}
              loading={installingAll}
              disabled={!report || missing.length === 0}
              onClick={() => void installRecommended()}
              data-testid="onboarding-install"
            >
              {t("onboarding.tools.install")}
            </Button>
          )
        }
      >
        {allError && (
          <Notice
            tone="error"
            title={t("onboarding.tools.failed")}
            detail={allError.detail}
            actions={[
              { label: t("common.retry"), primary: true, onClick: () => void installRecommended() },
            ]}
          >
            {t("onboarding.tools.failedHint")}
          </Notice>
        )}
        {needed ? (
          <DepsLedger deps={needed} compact caption={t("onboarding.tools.title")} />
        ) : (
          <Skeleton count={3} columns={[30, 10, 14, 14]} />
        )}
        <p className={screen.prose}>{t("onboarding.tools.where")}</p>
      </Section>

      <Section title={t("onboarding.folders.title")} description={t("onboarding.folders.body")}>
        {settings && (
          <dl className={s.folders}>
            {(["videoDir", "audioDir"] as const).map((field) => (
              <div key={field} className={s.folder}>
                <dt>{t(`onboarding.folders.${field}`)}</dt>
                <dd className={screen.path}>{settings[field]}</dd>
                <dd>
                  <Button
                    size="sm"
                    variant="secondary"
                    leadingIcon={FolderOpen}
                    onClick={() => void choose(field)}
                  >
                    {t("onboarding.folders.change")}
                  </Button>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Section>

      <Section title={t("onboarding.accounts.title")}>
        <div className={s.accounts}>
          <p className={screen.prose}>{t("onboarding.accounts.body")}</p>
          <Button
            variant="ghost"
            leadingIcon={KeyRound}
            onClick={() => useNav.getState().navigate("settings", "accounts")}
          >
            {t("onboarding.accounts.open")}
          </Button>
        </div>
      </Section>

      <footer className={s.footer}>
        <Button
          variant="primary"
          size="lg"
          disabled={!ready}
          onClick={finish}
          data-testid="onboarding-finish"
        >
          {t("onboarding.finish")}
        </Button>
        {!ready && (
          <Button variant="ghost" onClick={finish} data-testid="onboarding-skip">
            {t("onboarding.skip")}
          </Button>
        )}
        <p className={s.footNote}>
          {ready ? t("onboarding.readyNote") : t("onboarding.notReadyNote")}
        </p>
      </footer>
    </div>
  );
}
