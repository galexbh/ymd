// Tells the person about a new ymd release: at launch and every few hours while ymd stays open.
// In the app it is a toast that stays until dismissed; when ymd is in the background it is also
// a system notification, sent once per version.
import i18n from "../i18n";
import { useNav } from "../store/nav";
import { useAppUpdate } from "../store/appUpdate";
import { useToasts } from "../ui";

/** How often a running ymd looks for a new release. */
export const RECHECK_MS = 6 * 60 * 60 * 1000;
const NOTIFIED_KEY = "ymd.updateNotifiedVersion";

export interface UpdateNoticeDeps {
  /** Quiet check; true when a newer version is available. */
  check: () => Promise<boolean>;
  version: () => string | null;
  /** The ymd window has focus (a toast is enough). */
  focused: () => boolean;
  toast: (version: string) => void;
  notify: (title: string, body: string) => Promise<void>;
  /** Last version announced by a system notification (survives restarts when it can). */
  notified: { get: () => string | null; set: (v: string) => void };
}

/** One check: toast once per version per session, system notification once per version. */
export function createUpdateNotice(deps: UpdateNoticeDeps): () => Promise<void> {
  let toasted: string | null = null;
  return async () => {
    if (!(await deps.check())) return;
    const version = deps.version();
    if (!version) return;
    if (toasted !== version) {
      toasted = version;
      deps.toast(version);
    }
    if (!deps.focused() && deps.notified.get() !== version) {
      deps.notified.set(version);
      await deps
        .notify(i18n.t("toast.appUpdate", { version }), i18n.t("toast.appUpdateNotifyBody"))
        .catch(() => {});
    }
  };
}

function toastUpdate(version: string) {
  useToasts.getState().push({
    tone: "info",
    title: i18n.t("toast.appUpdate", { version }),
    timeout: 0,
    actions: [
      {
        label: i18n.t("toast.appUpdateInstall"),
        primary: true,
        onClick: () => void useAppUpdate.getState().install(),
      },
      {
        label: i18n.t("toast.appUpdateNotes"),
        onClick: () => useNav.getState().navigate("settings", "advanced"),
      },
    ],
  });
}

/** System notification through the notification plugin (asks for permission once). */
export async function notifySystem(title: string, body: string): Promise<void> {
  const { isPermissionGranted, requestPermission, sendNotification } =
    await import("@tauri-apps/plugin-notification");
  let granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === "granted";
  if (granted) sendNotification({ title, body });
}

const storedVersion = {
  get: (): string | null => {
    try {
      return localStorage.getItem(NOTIFIED_KEY);
    } catch {
      return null;
    }
  },
  set: (v: string) => {
    try {
      localStorage.setItem(NOTIFIED_KEY, v);
    } catch {
      // private storage unavailable: at worst the notification repeats next launch
    }
  },
};

/** Starts the checks (installed app only). Returns the cleanup. */
export function connectAppUpdates(): () => void {
  if (import.meta.env.DEV) return () => {};
  const run = createUpdateNotice({
    check: () => useAppUpdate.getState().check(true),
    version: () => useAppUpdate.getState().version,
    focused: () => typeof document !== "undefined" && document.hasFocus(),
    toast: toastUpdate,
    notify: notifySystem,
    notified: storedVersion,
  });
  void run();
  const timer = setInterval(() => void run(), RECHECK_MS);
  return () => clearInterval(timer);
}
