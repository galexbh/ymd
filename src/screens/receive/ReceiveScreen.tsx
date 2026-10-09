import { useEffect } from "react";
import { ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, ErrorNotice, Section, Skeleton } from "../../ui";
import { sortedJobs, useJobs } from "../../store/jobs";
import { useNav } from "../../store/nav";
import { useReceive } from "../../store/receive";
import { useSettings } from "../../store/settings";
import { JobsLedger } from "../shared/JobsLedger";
import { ScreenHeader } from "../shared/ScreenHeader";
import { useErrorFixes } from "../shared/errorFixes";
import screen from "../shared/screen.module.css";
import { AccessionCard } from "./AccessionCard";
import { CounterStrip } from "./CounterStrip";
import s from "./receive.module.css";

export function ReceiveScreen() {
  const { t } = useTranslation();
  const settings = useSettings((st) => st.settings);
  const status = useReceive((st) => st.status);
  const probe = useReceive((st) => st.probe);
  const probeError = useReceive((st) => st.probeError);
  const enqueueError = useReceive((st) => st.enqueueError);
  const jobsMap = useJobs((st) => st.jobs);
  const jobs = sortedJobs(jobsMap);
  const hasFinished = jobs.some(
    (j) => j.stage === "done" || j.stage === "canceled" || j.stage === "error",
  );
  const navigate = useNav((n) => n.navigate);
  const fixes = useErrorFixes();

  // start on the kind of the default preset
  const defaultKind = settings?.presets.find((p) => p.id === settings.defaultPresetId)?.kind;
  useEffect(() => {
    if (defaultKind && Object.keys(useReceive.getState().presetByKind).length === 0) {
      useReceive.getState().setKind(defaultKind);
    }
  }, [defaultKind]);

  return (
    <div className={`${screen.screen} ${s.receive}`}>
      <ScreenHeader title={t("nav.receive")} hidden />
      <CounterStrip />

      <div className={s.cardSlot} aria-live="polite" aria-busy={status === "loading"}>
        {status === "loading" && (
          <div className={s.cardLoading} data-testid="probe-skeleton">
            <span className={s.cardLabel}>{t("receive.probing")}</span>
            <Skeleton variant="text" count={4} />
          </div>
        )}
        {status === "error" && probeError && (
          <ErrorNotice
            code={probeError.code}
            detail={probeError.detail}
            actions={fixes(probeError.code, () => void useReceive.getState().runProbe())}
          />
        )}
        {status === "ready" && probe && <AccessionCard probe={probe} />}
        {enqueueError && (
          <ErrorNotice
            code={enqueueError.code}
            detail={enqueueError.detail}
            actions={fixes(enqueueError.code)}
          />
        )}
      </div>

      <Section
        title={t("receive.ledgerTitle")}
        actions={
          <>
            {hasFinished && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void useJobs.getState().clearFinished()}
              >
                {t("ledger.clearFinished")}
              </Button>
            )}
            {jobs.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                leadingIcon={ListChecks}
                onClick={() => navigate("queue")}
              >
                {t("receive.openQueue")}
              </Button>
            )}
          </>
        }
      >
        <JobsLedger jobs={jobs} caption={t("receive.ledgerTitle")} />
      </Section>
    </div>
  );
}
