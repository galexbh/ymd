// App start-up: settings first (theme + language), then live jobs and dependencies.
import { useEffect } from "react";
import i18n from "../i18n";
import type { Job } from "../ipc/types";
import { useToasts } from "../ui";
import { connectDeps } from "../store/deps";
import { useHistory } from "../store/history";
import { connectJobs, onJobChange } from "../store/jobs";
import { connectBrowserLinks, connectClipboard } from "../store/clipboard";
import { useNav } from "../store/nav";
import { useSettings } from "../store/settings";
import { connectJobNotice } from "./jobNotice";
import { showInFolder } from "./native";
import { connectTrayNotice } from "./trayNotice";
import { connectAppUpdates } from "./updateNotice";

export function announce(job: Job, prev: Job | undefined) {
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
  // the catalog gains rows when something is filed; only re-query when it is on screen (the
  // catalog refreshes itself on every visit), not once per finished job while in the tray
  if (useNav.getState().route === "catalog" && useHistory.getState().status !== "idle") {
    void useHistory.getState().refresh();
  }
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
    void Promise.allSettled([connectJobs(), connectDeps()]).then((results) => {
      for (const r of results) {
        if (r.status === "rejected") {
          console.error("ymd: could not subscribe to backend events", r.reason);
          continue;
        }
        if (alive) offs.push(r.value);
        else r.value();
      }
    });
    return () => {
      alive = false;
      offs.forEach((f) => f());
    };
  }, []);
}
