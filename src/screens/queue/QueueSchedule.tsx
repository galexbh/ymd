import { useEffect, useState, type FormEvent } from "react";
import { AlarmClock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, ErrorNotice, Notice, TextField } from "../../ui";
import { useJobs } from "../../store/jobs";
import { formatClock, isLaterDay, nextOccurrence, parseClock } from "./schedule";
import s from "./queue.module.css";

/** Wall-clock epoch ms, refreshed every minute (so «mañana» turns into today after midnight). */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** «Programar inicio»: a local HH:MM; the queue holds queued jobs until its next occurrence. */
export function ScheduleControl() {
  const { t } = useTranslation();
  const schedule = useJobs((st) => st.schedule);
  const [time, setTime] = useState("");
  const [touched, setTouched] = useState(false);
  const valid = parseClock(time) !== null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const next = nextOccurrence(time, new Date());
    if (next) void schedule(next.toISOString());
  };

  return (
    <form className={s.schedule} onSubmit={submit} data-testid="queue-schedule">
      <TextField
        label={t("queue.schedule.time")}
        hideLabel
        type="time"
        mono
        value={time}
        error={touched && time !== "" && !valid ? t("queue.schedule.invalid") : undefined}
        onChange={(e) => setTime(e.target.value)}
        fieldClassName={s.scheduleTime}
        data-testid="queue-schedule-time"
      />
      <Button type="submit" variant="secondary" leadingIcon={AlarmClock} disabled={!valid}>
        {t("queue.schedule.action")}
      </Button>
    </form>
  );
}

/** Shown while a start is scheduled: when, and how to start now or drop it. */
export function ScheduleBanner() {
  const { t } = useTranslation();
  const startAt = useJobs((st) => st.startAt);
  const error = useJobs((st) => st.scheduleError);
  const schedule = useJobs((st) => st.schedule);
  const now = useMinuteClock();
  if (error) {
    return (
      <ErrorNotice
        code={error.code}
        detail={error.detail}
        onDismiss={() => useJobs.setState({ scheduleError: null })}
      />
    );
  }
  if (!startAt) return null;
  const at = new Date(startAt);
  const time = formatClock(at);
  const title = isLaterDay(at, new Date(now))
    ? t("queue.schedule.tomorrow", { time })
    : t("queue.schedule.today", { time });
  return (
    <div data-testid="queue-schedule-banner">
      <Notice
        tone="info"
        title={title}
        actions={[
          {
            label: t("queue.schedule.startNow"),
            primary: true,
            onClick: () => void schedule(null),
          },
          { label: t("queue.schedule.remove"), onClick: () => void schedule(null) },
        ]}
      >
        {t("queue.schedule.body")}
      </Notice>
    </div>
  );
}
