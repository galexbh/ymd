// Every error code maps to a concrete next step the user can take from where they are.
import { useTranslation } from "react-i18next";
import type { Browser, ErrorCode } from "../../ipc/types";
import type { NoticeAction } from "../../ui";
import { useDeps } from "../../store/deps";
import { useNav } from "../../store/nav";
import { useSettings } from "../../store/settings";

export type FixKind = "accounts" | "install" | "folders" | "closeBrowser" | "updateYtdlp" | "none";

export function fixKind(code: ErrorCode): FixKind {
  switch (code) {
    case "bot_check":
    case "age_restricted":
    case "login_required":
    case "private":
    case "cookies_decrypt":
      return "accounts";
    case "ffmpeg_missing":
    case "js_runtime_missing":
    case "binary_missing":
      return "install";
    case "cookies_locked":
      return "closeBrowser";
    case "disk_full":
    case "permission_denied":
      return "folders";
    case "unsupported_url":
    case "unknown":
      return "updateYtdlp";
    default:
      return "none";
  }
}

export const BROWSER_NAMES: Record<Browser, string> = {
  brave: "Brave",
  chrome: "Chrome",
  chromium: "Chromium",
  edge: "Edge",
  firefox: "Firefox",
  opera: "Opera",
  safari: "Safari",
  vivaldi: "Vivaldi",
  whale: "Whale",
};

/** Actions for an error; `retry` re-runs whatever failed (a job, a probe). */
export function useErrorFixes() {
  const { t } = useTranslation();
  const navigate = useNav((n) => n.navigate);
  const cookies = useSettings((s) => s.settings?.cookies);
  const browser = cookies?.kind === "browser" ? BROWSER_NAMES[cookies.browser] : null;

  return (code: ErrorCode, retry?: () => void): NoticeAction[] => {
    const out: NoticeAction[] = [];
    switch (fixKind(code)) {
      case "accounts":
        out.push({
          label: t("fix.accounts"),
          primary: true,
          onClick: () => navigate("settings", "accounts"),
        });
        break;
      case "install": {
        const id =
          code === "ffmpeg_missing" ? "ffmpeg" : code === "js_runtime_missing" ? "deno" : null;
        out.push({
          label:
            id === "ffmpeg"
              ? t("fix.installFfmpeg")
              : id === "deno"
                ? t("fix.installDeno")
                : t("fix.installMissing"),
          primary: true,
          onClick: () => {
            navigate("deps");
            const deps = useDeps.getState();
            if (id) void deps.install(id);
            else void deps.installRecommended();
          },
        });
        break;
      }
      case "closeBrowser":
        if (retry) {
          out.push({
            label: browser ? t("fix.closedRetryNamed", { browser }) : t("fix.closedRetry"),
            primary: true,
            onClick: retry,
          });
        }
        out.push({
          label: t("fix.useCookieFile"),
          onClick: () => navigate("settings", "accounts"),
        });
        return out;
      case "folders":
        out.push({
          label: t("fix.folders"),
          primary: true,
          onClick: () => navigate("settings", "downloads"),
        });
        break;
      case "updateYtdlp":
        out.push({ label: t("fix.updateYtdlp"), onClick: () => navigate("deps") });
        break;
      default:
        break;
    }
    if (retry) out.push({ label: t("common.retry"), primary: out.length === 0, onClick: retry });
    return out;
  };
}
