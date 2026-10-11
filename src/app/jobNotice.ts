// System notifications for downloads, with judgement: only when ymd is in the background (in
// the window the toast is enough), only with «notifyDownloads» on, and downloads that end
// together arrive as one notification. Desktop notifications have no click event, so when one
// announced a failure, the next time the window gets focus ymd opens the Registro once.
import i18n from "../i18n";
import type { Job } from "../ipc/types";
import { useNav } from "../store/nav";
import { onJobChange } from "../store/jobs";
import { useSettings } from "../store/settings";
import { notifySystem } from "./updateNotice";

/** Downloads ending within this window share one notification. */
export const GROUP_MS = 2000;

export interface JobNoticeDeps {
  /** The ymd window is focused and visible (the in-app toast is enough). */
  focused: () => boolean;
  /** Setting «notifyDownloads». */
  enabled: () => boolean;
  notify: (title: string, body: string) => Promise<void>;
  /** Open the Registro (queue) screen. */
  goToQueue: () => void;
}

export interface JobNotice {
  /** Feed every job update (`onJobChange`). */
  onJob: (job: Job, prev: Job | undefined) => void;
  /** The window got focus again. */
  onFocus: () => void;
  dispose: () => void;
}

const nameOf = (j: Job) => j.title?.trim() || j.url;

/** Title and body for the jobs that ended together (at least one). */
export function jobNoticeText(jobs: Job[]): { title: string; body: string } {
  const failed = jobs.filter((j) => j.stage === "error");
  if (jobs.length === 1) {
    const [j] = jobs;
    if (j.stage === "error") {
      return {
        title: i18n.t("toast.jobFailed", { title: nameOf(j) }),
        body: i18n.t(`error.${j.error?.code ?? "unknown"}.title`),
      };
    }
    return { title: i18n.t("toast.jobDone"), body: nameOf(j) };
  }
  if (failed.length > 0) {
    return {
      title: i18n.t("toast.jobsMixed", { count: jobs.length, failed: failed.length }),
      body: i18n.t("toast.jobsMixedBody"),
    };
  }
  return {
    title: i18n.t("toast.jobsDone", { count: jobs.length }),
    body: jobs.map(nameOf).join(" · "),
  };
}

export function createJobNotice(deps: JobNoticeDeps): JobNotice {
  let batch: Job[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let errorAnnounced = false;

  const flush = () => {
    timer = null;
    const jobs = batch;
    batch = [];
    // Came back to the window meanwhile: the toasts already told.
    if (jobs.length === 0 || deps.focused() || !deps.enabled()) return;
    if (jobs.some((j) => j.stage === "error")) errorAnnounced = true;
    const { title, body } = jobNoticeText(jobs);
    void deps.notify(title, body).catch(() => {});
  };

  return {
    onJob: (job, prev) => {
      if (job.stage !== "done" && job.stage !== "error") return;
      if (!prev || prev.stage === job.stage) return;
      if (deps.focused() || !deps.enabled()) return;
      batch = [...batch.filter((j) => j.id !== job.id), job];
      timer ??= setTimeout(flush, GROUP_MS);
    },
    onFocus: () => {
      if (!errorAnnounced) return;
      errorAnnounced = false;
      deps.goToQueue();
    },
    dispose: () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      batch = [];
    },
  };
}

function windowFocused(): boolean {
  return (
    typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus()
  );
}

/** Wires the notices to the jobs store and window focus. Returns the cleanup. */
export function connectJobNotice(): () => void {
  const notice = createJobNotice({
    focused: windowFocused,
    enabled: () => useSettings.getState().settings?.notifyDownloads ?? true,
    notify: notifySystem,
    goToQueue: () => useNav.getState().navigate("queue"),
  });
  const offJobs = onJobChange(notice.onJob);
  const onFocus = () => {
    if (windowFocused()) notice.onFocus();
  };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onFocus);
  return () => {
    offJobs();
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onFocus);
    notice.dispose();
  };
}
