import { useEffect, useState } from "react";
import { ExternalLink, FlaskConical, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api, toCommandError } from "../../ipc/commands";
import type {
  Browser,
  BrowserInfo,
  CommandError,
  CookieFileInfo,
  CookieSource,
} from "../../ipc/types";
import {
  Button,
  ErrorNotice,
  Figure,
  Icon,
  Notice,
  Section,
  SegmentedControl,
  Select,
  Skeleton,
  Tag,
  formatDate,
} from "../../ui";
import { currentLocale } from "../../i18n";
import { openExternal, osPlatform } from "../../app/native";
import { useSettings } from "../../store/settings";
import { BROWSER_NAMES } from "../shared/errorFixes";
import screen from "../shared/screen.module.css";
import { DIRECT_BROWSERS, FIREFOX_DOWNLOAD_URL, orderBrowsers } from "./constants";
import { ExtensionCard } from "./ExtensionCard";
import s from "./settings.module.css";
import { SiteAccounts } from "./SiteAccounts";
import { HowToAddMore, SupportedSites } from "./SupportedSites";

/** Anchor of the cookies section, for "use cookies" links further down. */
const COOKIES_SECTION_ID = "accounts-cookies";

function goToCookies() {
  const el = document.getElementById(COOKIES_SECTION_ID);
  if (!el) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  el.focus({ preventScroll: true });
}

type Run = { status: "idle" | "running" | "ok" | "fail"; error: CommandError | null };
const IDLE: Run = { status: "idle", error: null };

/**
 * Where cookies come from. Chromium browsers (Brave, Chrome, Edge…) only through the ymd
 * extension: Windows encrypts their cookies so no other program can read them, and they stay
 * locked while the browser (or its background processes) runs. Firefox, and Safari on macOS,
 * are read directly. There is no manual cookies.txt import: a hand-exported file carries every
 * session in plain text, outside the browser's protection.
 */
export function AccountsSettings() {
  const { t } = useTranslation();
  const settings = useSettings((st) => st.settings)!;
  const update = useSettings((st) => st.update);
  const [browsers, setBrowsers] = useState<BrowserInfo[] | null>(null);
  const [cookieInfo, setCookieInfo] = useState<CookieFileInfo | null | undefined>(undefined);
  const [test, setTest] = useState<Run>(IDLE);

  const source = settings.cookies;
  const mac = osPlatform() === "macos";
  const direct = browsers
    ? orderBrowsers(browsers).filter((b) => DIRECT_BROWSERS.includes(b.browser))
    : [];
  const chosen: Browser | null = source.kind === "browser" ? source.browser : null;
  const chosenInfo = direct.find((b) => b.browser === chosen) ?? null;

  const chooseBrowser = (browser: Browser) => {
    setTest(IDLE);
    update({ cookies: { kind: "browser", browser, profile: null } });
  };

  const detect = () =>
    api
      .browsersDetect()
      .then(setBrowsers)
      .catch(() => setBrowsers([]));

  const refreshInfo = () =>
    api
      .cookiesInfo()
      .then(setCookieInfo)
      .catch(() => setCookieInfo(null));

  useEffect(() => {
    void detect();
    void refreshInfo();
  }, []);

  const setSource = (kind: CookieSource["kind"]) => {
    setTest(IDLE);
    if (kind === "browser") {
      const first = direct.find((b) => b.installed) ?? direct[0];
      update({
        cookies: { kind: "browser", browser: first?.browser ?? "firefox", profile: null },
      });
    } else update({ cookies: { kind } });
  };

  const runTest = async () => {
    setTest({ status: "running", error: null });
    try {
      const r = await api.cookiesTest(source);
      setTest(r.ok ? { status: "ok", error: null } : { status: "fail", error: r.error });
    } catch (e) {
      setTest({ status: "fail", error: toCommandError(e) });
    }
  };

  const problem = (run: Run, retry: () => void) =>
    run.status === "fail" && run.error ? (
      <ErrorNotice
        code={run.error.code}
        detail={run.error.detail}
        actions={[{ label: t("common.retry"), primary: true, onClick: retry }]}
      />
    ) : null;

  const browserPicker = (
    <div className={s.browsers}>
      <div className={s.browsersHead}>
        <span className={s.fieldLabel}>{t("accounts.browser.label")}</span>
        <Button size="sm" variant="ghost" leadingIcon={RefreshCw} onClick={() => void detect()}>
          {t("accounts.browser.detect")}
        </Button>
      </div>
      {browsers === null ? (
        <Skeleton variant="text" count={2} />
      ) : direct.length === 0 ? (
        <p className={screen.muted}>{t("accounts.browser.none")}</p>
      ) : (
        <div role="radiogroup" aria-label={t("accounts.browser.label")} className={s.browserList}>
          {direct.map((b) => (
            <label
              key={b.browser}
              className={s.browserRow}
              data-checked={chosen === b.browser || undefined}
              data-absent={!b.installed || undefined}
              data-testid={`browser-${b.browser}`}
            >
              <input
                type="radio"
                name="cookie-browser"
                checked={chosen === b.browser}
                disabled={!b.installed}
                onChange={() => chooseBrowser(b.browser)}
              />
              <span className={s.browserName}>{BROWSER_NAMES[b.browser]}</span>
              {!b.installed && <Tag>{t("accounts.browser.notInstalled")}</Tag>}
              {b.installed ? (
                <span className={s.fieldHint}>
                  {t("accounts.browser.profiles", { n: b.profiles.length })}
                </span>
              ) : (
                b.browser === "firefox" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    leadingIcon={ExternalLink}
                    onClick={(e) => {
                      e.preventDefault();
                      void openExternal(FIREFOX_DOWNLOAD_URL).catch(() => {});
                    }}
                  >
                    {t("accounts.browser.getFirefox")}
                  </Button>
                )
              )}
            </label>
          ))}
        </div>
      )}
      {chosenInfo && chosenInfo.profiles.length > 0 && source.kind === "browser" && (
        <Select
          label={t("accounts.browser.profile")}
          value={source.profile ?? ""}
          onChange={(e) => update({ cookies: { ...source, profile: e.target.value || null } })}
          options={[
            {
              value: "",
              label: t("accounts.browser.defaultProfile", { name: chosenInfo.profiles[0].name }),
            },
            ...chosenInfo.profiles.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      )}
    </div>
  );

  return (
    <>
      <Section
        id={COOKIES_SECTION_ID}
        tabIndex={-1}
        className={s.anchor}
        title={t("accounts.cookies.title")}
        description={t("accounts.cookies.description")}
      >
        <div className={s.fieldStack}>
          <span className={s.fieldLabel}>{t("accounts.source.label")}</span>
          <SegmentedControl<CookieSource["kind"]>
            label={t("accounts.source.label")}
            value={source.kind}
            onChange={setSource}
            options={[
              { value: "none", label: t("accounts.source.none") },
              { value: "extension", label: t("accounts.source.extension") },
              {
                value: "browser",
                label: mac ? t("accounts.source.browserMac") : t("accounts.source.browser"),
              },
            ]}
          />
          <p className={s.fieldHint}>
            {source.kind === "browser" && mac
              ? t("accounts.source.hint.browserMac")
              : t(`accounts.source.hint.${source.kind}`)}
          </p>
        </div>

        {source.kind === "browser" && browserPicker}

        {source.kind !== "none" && (
          <div className={screen.inline}>
            <Button
              variant="secondary"
              leadingIcon={FlaskConical}
              loading={test.status === "running"}
              onClick={() => void runTest()}
              data-testid="cookies-test"
            >
              {t("accounts.test")}
            </Button>
          </div>
        )}
        {test.status === "ok" && (
          <Notice tone="success" title={t("accounts.testOk")}>
            {t("accounts.testOkBody")}
          </Notice>
        )}
        {problem(test, () => void runTest())}
      </Section>

      {source.kind === "extension" && (
        <ExtensionCard prominent onSynced={() => void refreshInfo()} />
      )}

      <Section title={t("accounts.file.title")}>
        {cookieInfo === undefined ? (
          <Skeleton variant="text" count={2} />
        ) : cookieInfo ? (
          <div className={s.cookieFile} data-testid="cookie-info">
            <dl className={s.facts}>
              <div>
                <dt>{t("accounts.file.origin")}</dt>
                <dd>{cookieInfo.origin}</dd>
              </div>
              <div>
                <dt>{t("accounts.file.date")}</dt>
                <dd>
                  <Figure value={formatDate(cookieInfo.createdAt, currentLocale())} />
                </dd>
              </div>
              <div>
                <dt>{t("accounts.file.count")}</dt>
                <dd>
                  <Figure value={cookieInfo.cookieCount} />
                </dd>
              </div>
              <div>
                <dt>{t("session.youtube")}</dt>
                <dd data-testid="cookie-session">
                  {cookieInfo.signedIn.includes("youtube.com")
                    ? t("session.active")
                    : t("session.closed")}
                </dd>
              </div>
              <div className={s.factWide}>
                <dt>{t("accounts.file.domains")}</dt>
                <dd className={s.domains}>
                  {cookieInfo.domains.map((d) => (
                    <Tag key={d} mono>
                      {d}
                    </Tag>
                  ))}
                </dd>
              </div>
            </dl>
            <Button
              variant="ghost"
              leadingIcon={Trash2}
              onClick={async () => {
                await api.cookiesClear().catch(() => {});
                setCookieInfo(null);
              }}
            >
              {t("accounts.file.clear")}
            </Button>
          </div>
        ) : (
          <p className={screen.muted}>{t("accounts.file.noneYet")}</p>
        )}
        <p className={s.privacy}>
          <Icon icon={ShieldCheck} size={16} />
          <span>{t("accounts.file.privacy")}</span>
        </p>
      </Section>

      <SiteAccounts onGoToCookies={goToCookies} />
      <SupportedSites />
      <HowToAddMore onGoToCookies={goToCookies} />
    </>
  );
}
