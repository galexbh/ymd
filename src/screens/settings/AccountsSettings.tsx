import { useEffect, useRef, useState } from "react";
import { ExternalLink, FileUp, FlaskConical, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
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
import { onFileDrop, openExternal, osPlatform, pickCookieFile } from "../../app/native";
import { useSettings } from "../../store/settings";
import { BROWSER_NAMES } from "../shared/errorFixes";
import screen from "../shared/screen.module.css";
import { CHROMIUM, FIREFOX_DOWNLOAD_URL, orderBrowsers } from "./constants";
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

export function AccountsSettings() {
  const { t } = useTranslation();
  const settings = useSettings((st) => st.settings)!;
  const update = useSettings((st) => st.update);
  const [browsers, setBrowsers] = useState<BrowserInfo[] | null>(null);
  const [cookieInfo, setCookieInfo] = useState<CookieFileInfo | null | undefined>(undefined);
  const [test, setTest] = useState<Run>(IDLE);
  const [snap, setSnap] = useState<Run>(IDLE);
  const [imp, setImp] = useState<Run>(IDLE);
  const [over, setOver] = useState(false);
  const guideRef = useRef<HTMLElement>(null);

  const source = settings.cookies;
  const ordered = browsers ? orderBrowsers(browsers) : [];
  const chosen: Browser | null = source.kind === "browser" ? source.browser : null;
  const chosenInfo = ordered.find((b) => b.browser === chosen) ?? null;
  const windows = osPlatform() === "windows";
  const chromiumInPlay =
    (chosen !== null && CHROMIUM.includes(chosen)) ||
    ordered.some((b) => CHROMIUM.includes(b.browser));
  const guideFirst = windows && chromiumInPlay;
  const firefox = ordered.find((b) => b.browser === "firefox") ?? null;

  const chooseBrowser = (browser: Browser) => {
    setTest(IDLE);
    setSnap(IDLE);
    update({ cookies: { kind: "browser", browser, profile: null } });
  };
  /** Switch to Firefox when it is installed, otherwise open its download page. */
  const useFirefox = () => {
    if (firefox?.installed) chooseBrowser("firefox");
    else void openExternal(FIREFOX_DOWNLOAD_URL).catch(() => {});
  };

  const detect = () =>
    api
      .browsersDetect()
      .then(setBrowsers)
      .catch(() => setBrowsers([]));

  useEffect(() => {
    api
      .browsersDetect()
      .then(setBrowsers)
      .catch(() => setBrowsers([]));
    api
      .cookiesInfo()
      .then(setCookieInfo)
      .catch(() => setCookieInfo(null));
  }, []);

  const importPath = async (path: string) => {
    setImp({ status: "running", error: null });
    try {
      const info = await api.cookiesImport(path);
      setCookieInfo(info);
      setImp({ status: "ok", error: null });
      update({ cookies: { kind: "file" } });
    } catch (e) {
      setImp({ status: "fail", error: toCommandError(e) });
    }
  };

  // native file drop anywhere on the window while this section is open
  const importRef = useRef(importPath);
  useEffect(() => {
    importRef.current = importPath;
  });
  useEffect(() => {
    let off: (() => void) | null = null;
    let alive = true;
    void onFileDrop((e) => {
      if (e.type === "enter" || e.type === "over") setOver(true);
      else if (e.type === "leave") setOver(false);
      else {
        setOver(false);
        const file = e.paths.find((p) => /\.txt$/i.test(p)) ?? e.paths[0];
        if (file) void importRef.current(file);
      }
    }).then((un) => {
      if (alive) off = un;
      else un();
    });
    return () => {
      alive = false;
      off?.();
    };
  }, []);

  const setSource = (kind: CookieSource["kind"]) => {
    setTest(IDLE);
    if (kind === "browser") {
      const first = ordered.find((b) => b.installed) ?? ordered[0];
      update({
        cookies: { kind: "browser", browser: first?.browser ?? "brave", profile: null },
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

  const runSnapshot = async () => {
    if (source.kind !== "browser") return;
    setSnap({ status: "running", error: null });
    try {
      const info = await api.cookiesSnapshot(source.browser, source.profile);
      setCookieInfo(info);
      setSnap({ status: "ok", error: null });
    } catch (e) {
      setSnap({ status: "fail", error: toCommandError(e) });
    }
  };

  const pickFile = async () => {
    try {
      const path = await pickCookieFile(t("accounts.file.filter"));
      if (path) await importPath(path);
    } catch (e) {
      setImp({ status: "fail", error: toCommandError(e) });
    }
  };

  const browserName = chosen ? BROWSER_NAMES[chosen] : t("accounts.theBrowser");

  const cookieProblem = (run: Run, retry: () => void) => {
    if (run.status !== "fail" || !run.error) return null;
    const code = run.error.code;
    if (code === "cookies_locked") {
      return (
        <Notice
          tone="warning"
          title={t("accounts.locked.title", { browser: browserName })}
          detail={run.error.detail}
          actions={[
            {
              label: t("accounts.locked.retry", { browser: browserName }),
              primary: true,
              onClick: retry,
            },
            {
              label: t("accounts.locked.useFile"),
              onClick: () =>
                guideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
            },
          ]}
        >
          {t("accounts.locked.body", { browser: browserName })}
        </Notice>
      );
    }
    if (code === "cookies_decrypt") {
      return (
        <Notice
          tone="warning"
          title={t("error.cookies_decrypt.title")}
          detail={run.error.detail}
          actions={[
            {
              label: t("accounts.locked.useFile"),
              primary: true,
              onClick: () =>
                guideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
            },
            ...(chosen !== "firefox"
              ? [
                  {
                    label: firefox?.installed
                      ? t("accounts.decrypt.switchFirefox")
                      : t("accounts.browser.getFirefox"),
                    onClick: useFirefox,
                  },
                ]
              : []),
          ]}
        >
          {t("accounts.decrypt.body", { browser: browserName })}{" "}
          {chosen !== "firefox" && t("accounts.decrypt.orFirefox")}
        </Notice>
      );
    }
    return (
      <ErrorNotice
        code={code}
        detail={run.error.detail}
        actions={[{ label: t("common.retry"), primary: true, onClick: retry }]}
      />
    );
  };

  const guide = (
    <section
      ref={guideRef}
      className={s.guide}
      aria-labelledby="cookie-guide-title"
      data-testid="cookie-guide"
      data-prominent={guideFirst || undefined}
    >
      <h3 id="cookie-guide-title" className={s.guideTitle}>
        {t("accounts.guide.title")}
      </h3>
      <p className={screen.prose}>
        {guideFirst
          ? t("accounts.guide.whyWindows", { browser: browserName })
          : t("accounts.guide.why")}
      </p>
      <ol className={s.steps}>
        <li>{t("accounts.guide.step1", { browser: browserName })}</li>
        <li>{t("accounts.guide.step2")}</li>
        <li>{t("accounts.guide.step3")}</li>
        <li>{t("accounts.guide.step4")}</li>
        <li>{t("accounts.guide.step5")}</li>
      </ol>
      <div className={s.drop} data-over={over || undefined} data-testid="cookie-drop">
        <Icon icon={FileUp} size={20} />
        <div className={s.dropText}>
          <p>{over ? t("accounts.file.release") : t("accounts.file.drop")}</p>
          <p className={s.fieldHint}>{t("accounts.file.dropHint")}</p>
        </div>
        <Button
          variant="secondary"
          loading={imp.status === "running"}
          onClick={() => void pickFile()}
          data-testid="cookie-pick"
        >
          {t("accounts.file.pick")}
        </Button>
      </div>
      {imp.status === "ok" && (
        <Notice tone="success" title={t("accounts.file.imported")}>
          {t("accounts.file.importedBody")}
        </Notice>
      )}
      {imp.status === "fail" && imp.error && (
        <Notice tone="error" title={t("accounts.file.importFailed")} detail={imp.error.detail}>
          {t("accounts.file.importFailedHint")}
        </Notice>
      )}
    </section>
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
              { value: "browser", label: t("accounts.source.browser") },
              { value: "file", label: t("accounts.source.file") },
            ]}
          />
          <p className={s.fieldHint}>{t(`accounts.source.hint.${source.kind}`)}</p>
        </div>

        {source.kind === "browser" && (
          <div className={s.browsers}>
            <div className={s.browsersHead}>
              <span className={s.fieldLabel}>{t("accounts.browser.label")}</span>
              <Button
                size="sm"
                variant="ghost"
                leadingIcon={RefreshCw}
                onClick={() => void detect()}
              >
                {t("accounts.browser.detect")}
              </Button>
            </div>
            {browsers === null ? (
              <Skeleton variant="text" count={2} />
            ) : ordered.length === 0 ? (
              <p className={screen.muted}>{t("accounts.browser.none")}</p>
            ) : (
              <div
                role="radiogroup"
                aria-label={t("accounts.browser.label")}
                className={s.browserList}
              >
                {ordered.map((b) => {
                  const recommended = windows && b.browser === "firefox";
                  return (
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
                      {recommended && <Tag tone="accent">{t("accounts.browser.recommended")}</Tag>}
                      {!b.installed && <Tag>{t("accounts.browser.notInstalled")}</Tag>}
                      {b.running && <Tag tone="warning">{t("accounts.browser.running")}</Tag>}
                      {b.installed ? (
                        <span className={s.fieldHint}>
                          {t("accounts.browser.profiles", { n: b.profiles.length })}
                        </span>
                      ) : (
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
                      )}
                    </label>
                  );
                })}
              </div>
            )}
            {chosenInfo && chosenInfo.profiles.length > 0 && source.kind === "browser" && (
              <Select
                label={t("accounts.browser.profile")}
                value={source.profile ?? ""}
                onChange={(e) =>
                  update({
                    cookies: { ...source, profile: e.target.value || null },
                  })
                }
                options={[
                  {
                    value: "",
                    label: t("accounts.browser.defaultProfile", {
                      name: chosenInfo.profiles[0].name,
                    }),
                  },
                  ...chosenInfo.profiles.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            )}
            {windows && firefox && (
              <p className={s.fieldHint} data-testid="firefox-why">
                {t("accounts.browser.firefoxWhy")}
              </p>
            )}
            {chosenInfo?.running && (
              <p className={s.warnNote}>
                {t("accounts.browser.runningNote", { browser: browserName })}
              </p>
            )}
          </div>
        )}

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
            {source.kind === "browser" && (
              <Button
                variant="ghost"
                loading={snap.status === "running"}
                onClick={() => void runSnapshot()}
                data-testid="cookies-snapshot"
              >
                {t("accounts.snapshot")}
              </Button>
            )}
          </div>
        )}
        {test.status === "ok" && (
          <Notice tone="success" title={t("accounts.testOk")}>
            {t("accounts.testOkBody")}
          </Notice>
        )}
        {cookieProblem(test, () => void runTest())}
        {snap.status === "ok" && (
          <Notice tone="success" title={t("accounts.snapshotOk")}>
            {t("accounts.snapshotOkBody")}
          </Notice>
        )}
        {cookieProblem(snap, () => void runSnapshot())}
      </Section>

      {guideFirst && guide}

      <Section title={t("accounts.file.title")}>
        {cookieInfo === undefined ? (
          <Skeleton variant="text" count={2} />
        ) : cookieInfo ? (
          <div className={s.cookieFile} data-testid="cookie-info">
            <dl className={s.facts}>
              <div>
                <dt>{t("accounts.file.origin")}</dt>
                <dd>
                  {cookieInfo.origin === "file" ? t("accounts.file.originFile") : cookieInfo.origin}
                </dd>
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
                if (source.kind === "file") update({ cookies: { kind: "none" } });
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

      {!guideFirst && guide}

      <SiteAccounts onGoToCookies={goToCookies} />
      <SupportedSites />
      <HowToAddMore onGoToCookies={goToCookies} />
    </>
  );
}
