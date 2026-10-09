import type { ReactNode } from "react";
import {
  Inbox,
  Keyboard,
  Library,
  Package,
  ScrollText,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Isotype, Logotype } from "../assets/brand/Logo";
import { Dialog, Figure, Icon, Kbd, ToastRegion } from "../ui";
import { depById, depsNeedAttention, useDeps } from "../store/deps";
import { jobTotals, useJobs } from "../store/jobs";
import { ROUTES, useNav, type Route } from "../store/nav";
import { JS_RUNTIME_NAMES } from "../screens/shared/labels";
import { SHORTCUTS, useShortcutHelp } from "./shortcuts";
import s from "./shell.module.css";

const ICONS: Record<Route, LucideIcon> = {
  receive: Inbox,
  queue: ScrollText,
  catalog: Library,
  deps: Package,
  settings: Settings2,
};

function RailFooter() {
  const { t } = useTranslation();
  const report = useDeps((st) => st.report);
  const ytdlp = depById(report, "ytdlp");
  const rt = report?.jsRuntime;
  const openHelp = useShortcutHelp((st) => st.set);
  return (
    <div className={s.footer}>
      <dl className={s.versions}>
        <div>
          <dt>yt-dlp</dt>
          <dd className="figure" data-testid="rail-ytdlp">
            {ytdlp?.version ?? t("rail.missing")}
          </dd>
        </div>
        <div>
          <dt>{t("rail.js")}</dt>
          <dd className="figure">
            {rt ? `${JS_RUNTIME_NAMES[rt.name]} ${rt.version ?? ""}`.trim() : t("rail.missing")}
          </dd>
        </div>
      </dl>
      <button type="button" className={s.helpButton} onClick={() => openHelp(true)}>
        <Icon icon={Keyboard} size={16} />
        <span className={s.label}>{t("shortcuts.title")}</span>
      </button>
    </div>
  );
}

function Rail() {
  const { t } = useTranslation();
  const route = useNav((n) => n.route);
  const navigate = useNav((n) => n.navigate);
  const pending = useJobs((st) => {
    const x = jobTotals(st.jobs);
    return x.active + x.queued;
  });
  const attention = useDeps((st) => depsNeedAttention(st.report));

  return (
    <nav className={s.rail} aria-label={t("rail.label")}>
      <div className={s.brand}>
        <Logotype height={26} className={s.logotype} title="ymd" />
        <Isotype size={24} className={s.isotype} title="ymd" />
      </div>
      <ul className={s.items}>
        {ROUTES.map((r, i) => {
          const badge: ReactNode =
            r === "queue" && pending > 0 ? (
              <Figure
                value={pending}
                className={s.count}
                aria-label={t("rail.pending", { n: pending })}
              />
            ) : r === "deps" && attention ? (
              <span className={s.flag} role="img" aria-label={t("rail.attention")} />
            ) : null;
          return (
            <li key={r}>
              <button
                type="button"
                className={s.item}
                aria-current={route === r ? "page" : undefined}
                data-testid={`nav-${r}`}
                title={`${t(`nav.${r}`)} (Ctrl+${i + 1})`}
                onClick={() => navigate(r)}
              >
                <Icon icon={ICONS[r]} size={18} />
                <span className={s.label}>{t(`nav.${r}`)}</span>
                {badge}
              </button>
            </li>
          );
        })}
      </ul>
      <RailFooter />
    </nav>
  );
}

function ShortcutHelp() {
  const { t } = useTranslation();
  const open = useShortcutHelp((st) => st.open);
  const set = useShortcutHelp((st) => st.set);
  return (
    <Dialog open={open} onClose={() => set(false)} title={t("shortcuts.title")}>
      <dl className={s.shortcuts}>
        {SHORTCUTS.map((k) => (
          <div key={k.id}>
            <dt>
              {k.keys.map((key, i) => (
                <span key={key}>
                  {i > 0 && " "}
                  <Kbd>{key}</Kbd>
                </span>
              ))}
            </dt>
            <dd>{t(`shortcuts.${k.id}`)}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className={s.shell}>
      <a
        href="#main"
        className={s.skip}
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        {t("rail.skip")}
      </a>
      <Rail />
      <main id="main" className={s.main} tabIndex={-1}>
        {children}
      </main>
      <ShortcutHelp />
      <ToastRegion />
    </div>
  );
}
