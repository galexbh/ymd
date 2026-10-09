import { Download, FolderOpen, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, ErrorNotice, Figure, Notice, Section, Skeleton, Tag } from "../../ui";
import { openFile } from "../../app/native";
import { recommendedMissing, useDeps } from "../../store/deps";
import { useNav } from "../../store/nav";
import { JS_RUNTIME_NAMES } from "../shared/labels";
import { ScreenHeader } from "../shared/ScreenHeader";
import screen from "../shared/screen.module.css";
import { DepsLedger } from "./DepsLedger";
import s from "./deps.module.css";

export function DepsScreen() {
  const { t } = useTranslation();
  const report = useDeps((st) => st.report);
  const checking = useDeps((st) => st.checking);
  const installingAll = useDeps((st) => st.installingAll);
  const allError = useDeps((st) => st.allError);
  const loadError = useDeps((st) => st.loadError);
  const denoBusy = useDeps((st) => !!st.busy.deno);
  const { load, installRecommended, install } = useDeps.getState();
  const missing = recommendedMissing(report);

  return (
    <div className={screen.screen}>
      <ScreenHeader
        title={t("nav.deps")}
        description={t("deps.description")}
        actions={
          <>
            <Button
              variant="secondary"
              leadingIcon={RefreshCw}
              loading={checking}
              onClick={() => void load(true)}
              data-testid="deps-check"
            >
              {t("deps.check")}
            </Button>
            <Button
              variant="primary"
              leadingIcon={Download}
              loading={installingAll}
              disabled={missing.length === 0}
              onClick={() => void installRecommended()}
              data-testid="deps-install-all"
            >
              {t("deps.installAll")}
            </Button>
          </>
        }
      />

      {loadError && (
        <ErrorNotice
          code={loadError.code}
          detail={loadError.detail}
          actions={[{ label: t("common.retry"), primary: true, onClick: () => void load() }]}
        />
      )}
      {allError && (
        <Notice
          tone="error"
          title={t("deps.allFailed")}
          detail={allError.detail}
          actions={[
            { label: t("common.retry"), primary: true, onClick: () => void installRecommended() },
          ]}
        >
          {t("deps.allFailedHint")}
        </Notice>
      )}

      {report ? (
        <DepsLedger deps={report.deps} caption={t("nav.deps")} />
      ) : (
        <Skeleton count={5} columns={[30, 10, 14, 12, 12, 14]} />
      )}

      {report && (
        <div className={s.blocks}>
          <Section title={t("deps.runtime.title")}>
            <div className={s.runtime}>
              {report.jsRuntime ? (
                <>
                  <p className={s.runtimeLine}>
                    {t("deps.runtime.uses")}{" "}
                    <strong>{JS_RUNTIME_NAMES[report.jsRuntime.name]}</strong>
                    {report.jsRuntime.version && <Figure value={report.jsRuntime.version} />}
                    <Tag>
                      {report.jsRuntime.managed
                        ? t("deps.runtime.managed")
                        : t("deps.runtime.system")}
                    </Tag>
                  </p>
                  <p className={screen.path}>{report.jsRuntime.path}</p>
                  {report.jsRuntimesFound.length > 1 && (
                    <>
                      <p className={`${screen.muted} ${screen.small}`}>
                        {t("deps.runtime.alsoFound")}
                      </p>
                      <ul className={s.found}>
                        {report.jsRuntimesFound
                          .filter((r) => r.path !== report.jsRuntime?.path)
                          .map((r) => (
                            <li key={r.path}>
                              <span>{JS_RUNTIME_NAMES[r.name]}</span>
                              {r.version && <Figure value={r.version} muted />}
                              <span className={screen.path}>{r.path}</span>
                            </li>
                          ))}
                      </ul>
                    </>
                  )}
                  <p className={screen.prose}>{t("deps.runtime.why")}</p>
                </>
              ) : (
                <Notice
                  tone="warning"
                  title={t("deps.runtime.noneTitle")}
                  actions={[
                    {
                      label: t("fix.installDeno"),
                      primary: true,
                      onClick: () => void install("deno"),
                    },
                  ]}
                >
                  {denoBusy ? t("deps.state.installing") : t("deps.runtime.noneBody")}
                </Notice>
              )}
            </div>
          </Section>

          <Section title={t("deps.binDir.title")}>
            <div className={s.runtime}>
              <p className={screen.path} data-testid="deps-bindir">
                {report.binDir}
              </p>
              <div className={screen.inline}>
                <Button
                  size="sm"
                  variant="secondary"
                  leadingIcon={FolderOpen}
                  onClick={() => void openFile(report.binDir).catch(() => {})}
                >
                  {t("common.openFolder")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => useNav.getState().navigate("settings", "advanced")}
                >
                  {t("deps.binDir.change")}
                </Button>
              </div>
              <p className={screen.prose}>{t("deps.binDir.hint")}</p>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
