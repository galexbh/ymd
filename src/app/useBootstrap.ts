// App start-up: settings first (theme + language), then live jobs and dependencies.
import { useEffect } from "react";
import i18n from "../i18n";
import type { Job } from "../ipc/types";
import { useToasts } from "../ui";
import { connectDeps } from "../store/deps";
import { useHistory } from "../store/history";
import { connectJobs, onJobChange } from "../store/jobs";
import { connectBrowserLinks, connectClipboard } from "../store/clipboard";
import { useSettings } from "../store/settings";
import { connectJobNotice } from "./jobNotice";
import { showInFolder } from "./native";
import { connectTrayNotice } from "./trayNotice";
import { connectAppUpdates } from "./updateNotice";

function announce(job: Job, prev: Job | undefined) {
  if (job.stage !== "done" || !prev || prev.stage === "done") return;
  const title = job.title ?? job.url;
  useToasts.getState().push({
    tone: "success",
    title: i18n.t("toast.archived", { title }),
    actions: job.filepath
      ? [
          {
            label: i18n.t("ledger.action.reveal"),
            onClick: () => void showInFolder(job.filepath!).catch(() => {}),
          },
        ]
      : undefined,
  });
  // the catalog gains rows when something is filed
  if (useHistory.getState().status !== "idle") void useHistory.getState().refresh();
}

export function useBootstrap() {
  useEffect(() => {
    let alive = true;
    const offs: (() => void)[] = [];
    offs.push(onJobChange(announce));
    offs.push(connectClipboard());
    offs.push(connectBrowserLinks());
    void useSettings.getState().load();
    offs.push(connectAppUpdates());
    offs.push(connectTrayNotice());
    offs.push(connectJobNotice());
    void Promise.all([connectJobs(), connectDeps()]).then((fns) => {
      if (alive) offs.push(...fns);
      else fns.forEach((f) => f());
    });
    return () => {
      alive = false;
      offs.forEach((f) => f());
    };
  }, []);
}
