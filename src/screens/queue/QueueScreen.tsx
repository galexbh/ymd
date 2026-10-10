import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Job } from "../../ipc/types";
import { Button, Figure, SegmentedControl, SpeedFigure } from "../../ui";
import { isActive, jobTotals, sortedJobs, useJobs } from "../../store/jobs";
import { JobsLedger } from "../shared/JobsLedger";
import { ScreenHeader } from "../shared/ScreenHeader";
import screen from "../shared/screen.module.css";
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
  const jobsMap = useJobs((st) => st.jobs);
  const [filter, setFilter] = useState<Filter>("all");
  const all = sortedJobs(jobsMap);
  const totals = jobTotals(jobsMap);
  const shown = all.filter((j) => matches(filter, j));

  return (
    <div className={screen.screen}>
      <ScreenHeader
        title={t("nav.queue")}
        description={t("queue.description")}
        actions={
          <Button
            variant="secondary"
            disabled={totals.done + totals.failed === 0}
            onClick={() => void useJobs.getState().clearFinished()}
          >
            {t("ledger.clearFinished")}
          </Button>
        }
      />
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
      </div>
      <JobsLedger
        jobs={shown}
        caption={t("nav.queue")}
        empty={all.length === 0 ? "teach" : "filtered"}
      />
    </div>
  );
}
