import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Job } from "../../ipc/types";
import { Button, Figure, SegmentedControl, SpeedFigure } from "../../ui";
import { isActive, isTerminal, jobTotals, useJobIds, useJobs } from "../../store/jobs";
import { useShallow } from "zustand/react/shallow";
import { JobsLedger } from "../shared/JobsLedger";
import { ScreenHeader } from "../shared/ScreenHeader";
import { ScheduleBanner, ScheduleControl } from "./QueueSchedule";
import screen from "../shared/screen.module.css";
import { PendingNotice } from "./PendingNotice";
import s from "./queue.module.css";

type Filter = "all" | "active" | "queued" | "done" | "failed";

const matches = (f: Filter, j: Job) => {
  switch (f) {
    case "all":
      return true;
    case "active":
      return isActive(j.stage);
    case "queued":
      return j.stage === "queued";
    case "done":
      return j.stage === "done";
    case "failed":
      return j.stage === "error" || j.stage === "canceled";
  }
};

export function QueueScreen() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>("all");
  // ids, counts and flags only: a progress event re-renders the totals and that one row
  const shown = useJobIds(useCallback((j: Job) => matches(filter, j), [filter]));
  const anyJobs = useJobs((st) => Object.keys(st.jobs).length > 0);
  const anyFinished = useJobs((st) => Object.values(st.jobs).some((j) => isTerminal(j.stage)));

  return (
    <div className={screen.screen}>
      <ScreenHeader
        title={t("nav.queue")}
        description={t("queue.description")}
        actions={
          <>
            <ScheduleControl />
            <Button
              variant="secondary"
              disabled={!anyFinished}
              onClick={() => void useJobs.getState().clearFinished()}
            >
              {t("ledger.clearFinished")}
            </Button>
          </>
        }
      />
      <ScheduleBanner />
      <PendingNotice />
      <div className={s.bar}>
        <SegmentedControl<Filter>
          label={t("queue.filter")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t("queue.filters.all") },
            { value: "active", label: t("queue.filters.active") },
            { value: "queued", label: t("queue.filters.queued") },
            { value: "done", label: t("queue.filters.done") },
            { value: "failed", label: t("queue.filters.failed") },
          ]}
        />
        <QueueTotals />
      </div>
      <JobsLedger ids={shown} caption={t("nav.queue")} empty={anyJobs ? "filtered" : "teach"} />
    </div>
  );
}

/** Live counts and total speed: the one part of the screen that follows every progress event. */
function QueueTotals() {
  const { t } = useTranslation();
  const totals = useJobs(useShallow((st) => jobTotals(st.jobs)));
  return (
    <dl className={s.totals} aria-label={t("queue.totals")} data-testid="queue-totals">
      <div>
        <dt>{t("queue.filters.active")}</dt>
        <dd>
          <Figure value={totals.active} />
        </dd>
      </div>
      <div>
        <dt>{t("queue.filters.queued")}</dt>
        <dd>
          <Figure value={totals.queued} />
        </dd>
      </div>
      <div>
        <dt>{t("queue.filters.done")}</dt>
        <dd>
          <Figure value={totals.done} />
        </dd>
      </div>
      <div>
        <dt>{t("queue.speed")}</dt>
        <dd>
          <SpeedFigure bytesPerSecond={totals.active ? totals.speed : null} />
        </dd>
      </div>
    </dl>
  );
}
