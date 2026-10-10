// The toolbar icon's badge: quiet while all is well; "!" when YouTube is signed out (amber)
// or the bridge failed (red). The tooltip says which.
import { type ChromeApi } from "./chrome-api";
import { type Status } from "./status";

/** ymd's --warning and --danger tokens (light theme), readable on the toolbar. */
const WARNING = "#7a5300";
const DANGER = "#a8281f";

export interface Badge {
  text: string;
  color: string | null;
  /** i18n key of the tooltip; null = the default title */
  titleKey: string | null;
}

export function badgeFor(status: Status): Badge {
  if (status.error && status.error.code !== "host_rejected") {
    return { text: "!", color: DANGER, titleKey: "badgeError" };
  }
  if (status.sessions["youtube.com"] === false) {
    return { text: "!", color: WARNING, titleKey: "badgeSessionClosed" };
  }
  return { text: "", color: null, titleKey: null };
}

export async function applyBadge(
  api: Pick<ChromeApi, "action" | "i18n">,
  status: Status,
): Promise<void> {
  const b = badgeFor(status);
  await api.action.setBadgeText({ text: b.text });
  if (b.color) await api.action.setBadgeBackgroundColor({ color: b.color });
  await api.action.setTitle({
    title: b.titleKey ? api.i18n.getMessage(b.titleKey) || "ymd Cookies" : "ymd Cookies",
  });
}
