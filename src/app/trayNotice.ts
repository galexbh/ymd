// The first time the window's X hides ymd to the tray, the backend says so once
// (`app://hidden-to-tray`) and a system notification explains where ymd went.
import i18n from "../i18n";
import { events } from "../ipc/events";
import { useSettings } from "../store/settings";
import { osPlatform, type OsPlatform } from "./native";
import { notifySystem } from "./updateNotice";

export interface TrayNoticeDeps {
  platform: () => OsPlatform;
  notify: (title: string, body: string) => Promise<void>;
}

/** Notification text: macOS calls the tray «barra de menús». */
export function trayNoticeBody(platform: OsPlatform): string {
  return i18n.t(platform === "macos" ? "toast.hiddenToTrayMac" : "toast.hiddenToTray");
}

/** Handles one hidden-to-tray event: remember the flag locally, then notify. */
export function createTrayNotice(deps: TrayNoticeDeps): () => Promise<void> {
  return async () => {
    // The backend stored the flag; keep the local copy in step so a later save agrees.
    const current = useSettings.getState().settings;
    if (current && !current.trayHintShown) {
      useSettings.setState({ settings: { ...current, trayHintShown: true } });
    }
    await deps.notify("ymd", trayNoticeBody(deps.platform())).catch(() => {});
  };
}

/** Listens for the event. Returns the cleanup. */
export function connectTrayNotice(): () => void {
  const run = createTrayNotice({ platform: osPlatform, notify: notifySystem });
  let alive = true;
  let off: (() => void) | null = null;
  void events
    .onHiddenToTray(() => void run())
    .then((un) => {
      if (alive) off = un;
      else un();
    })
    .catch(() => {});
  return () => {
    alive = false;
    off?.();
  };
}
