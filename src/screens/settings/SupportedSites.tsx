import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Search,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  SUPPORTED_SITES,
  SUPPORTED_SITES_PAGE,
  YTDLP_ISSUES_URL,
  filterSites,
  type SiteFilter,
  type SupportedSite,
} from "../../data/supportedSites";
import { currentLocale } from "../../i18n";
import { openExternal } from "../../app/native";
import {
  Button,
  Figure,
  Ledger,
  LedgerBody,
  LedgerCell,
  LedgerHead,
  LedgerHeaderCell,
  LedgerRow,
  Section,
  SegmentedControl,
  Tag,
  TextField,
  formatCount,
  formatDate,
} from "../../ui";
import s from "./settings.module.css";

export const SITES_PAGE_SIZE = 25;

const open = (url: string) => void openExternal(url).catch(() => {});

/** "2026-10-10" as that calendar day in local time (Date parses it as UTC midnight). */
function localDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Collapsible, searchable register of every extractor yt-dlp ships. */
export function SupportedSites({ sites = SUPPORTED_SITES.sites }: { sites?: SupportedSite[] }) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SiteFilter>("all");
  const [page, setPage] = useState(0);

  const matches = useMemo(() => filterSites(sites, query, filter), [sites, query, filter]);
  const pages = Math.max(1, Math.ceil(matches.length / SITES_PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const from = current * SITES_PAGE_SIZE;
  const rows = matches.slice(from, from + SITES_PAGE_SIZE);
  const bodyId = "supported-sites-body";

  return (
    <Section
      title={t("accounts.supported.title")}
      description={t("accounts.supported.description")}
      data-testid="supported-sites"
      actions={
        <Button
          size="sm"
          variant="ghost"
          leadingIcon={expanded ? ChevronUp : ChevronDown}
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? t("accounts.supported.hide") : t("accounts.supported.show")}
        </Button>
      }
    >
      <div className={s.sitesMeta}>
        <Figure value={formatCount(sites.length, locale)} unit={t("accounts.supported.sites")} />
        <span className={s.fieldHint}>
          {t("accounts.supported.updated", {
            date: formatDate(localDay(SUPPORTED_SITES.fetchedAt), locale),
          })}
        </span>
        <Button
          size="sm"
          variant="ghost"
          leadingIcon={ExternalLink}
          onClick={() => open(SUPPORTED_SITES_PAGE)}
        >
          {t("accounts.supported.official")}
        </Button>
      </div>

      <div id={bodyId} hidden={!expanded} className={s.sitesBody}>
        {expanded && (
          <>
            <div className={s.sitesTools}>
              <TextField
                type="search"
                label={t("accounts.supported.search")}
                placeholder={t("accounts.supported.searchPlaceholder")}
                leadingIcon={Search}
                value={query}
                autoComplete="off"
                spellCheck={false}
                fieldClassName={s.sitesSearch}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
              <SegmentedControl<SiteFilter>
                label={t("accounts.supported.filter")}
                value={filter}
                onChange={(f) => {
                  setFilter(f);
                  setPage(0);
                }}
                options={[
                  { value: "all", label: t("accounts.supported.filterAll") },
                  { value: "account", label: t("accounts.supported.filterAccount") },
                  { value: "broken", label: t("accounts.supported.filterBroken") },
                ]}
              />
            </div>
            <p className={s.sitesCount} aria-live="polite" data-testid="supported-count">
              <Figure
                value={formatCount(matches.length, locale)}
                unit={t("accounts.supported.sites")}
              />
            </p>

            {rows.length === 0 ? (
              <p className={s.sitesEmpty}>{t("accounts.supported.empty")}</p>
            ) : (
              <Ledger
                caption={t("accounts.supported.title")}
                columns={["32%", "auto", "11rem"]}
                data-testid="supported-ledger"
              >
                <LedgerHead>
                  <tr>
                    <LedgerHeaderCell>{t("accounts.supported.colName")}</LedgerHeaderCell>
                    <LedgerHeaderCell>{t("accounts.supported.colDescription")}</LedgerHeaderCell>
                    <LedgerHeaderCell>{t("accounts.supported.colMarks")}</LedgerHeaderCell>
                  </tr>
                </LedgerHead>
                <LedgerBody>
                  {rows.map((site) => (
                    <LedgerRow key={site.name} data-testid="supported-row">
                      <LedgerCell truncate title={site.name} className={s.siteName}>
                        {site.name}
                      </LedgerCell>
                      <LedgerCell truncate muted title={site.description || undefined}>
                        {site.description || "—"}
                      </LedgerCell>
                      <LedgerCell>
                        <span className={s.marks}>
                          {site.netrc && <Tag>{t("accounts.supported.badgeAccount")}</Tag>}
                          {site.broken && (
                            <Tag tone="warning">{t("accounts.supported.badgeBroken")}</Tag>
                          )}
                        </span>
                      </LedgerCell>
                    </LedgerRow>
                  ))}
                </LedgerBody>
              </Ledger>
            )}

            {pages > 1 && (
              <nav className={s.pager} aria-label={t("accounts.supported.pages")}>
                <Button
                  size="sm"
                  variant="secondary"
                  leadingIcon={ChevronLeft}
                  disabled={current === 0}
                  onClick={() => setPage(current - 1)}
                >
                  {t("accounts.supported.prev")}
                </Button>
                <Figure
                  data-testid="supported-range"
                  value={t("accounts.supported.range", {
                    from: formatCount(from + 1, locale),
                    to: formatCount(from + rows.length, locale),
                    total: formatCount(matches.length, locale),
                  })}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  trailingIcon={ChevronRight}
                  disabled={current >= pages - 1}
                  onClick={() => setPage(current + 1)}
                >
                  {t("accounts.supported.next")}
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </Section>
  );
}

/** Three short answers to "my site isn't there". */
export function HowToAddMore({ onGoToCookies }: { onGoToCookies: () => void }) {
  const { t } = useTranslation();
  return (
    <Section title={t("accounts.howto.title")} data-testid="howto-more">
      <ol className={s.cases}>
        <li>
          <p className={s.caseTitle}>{t("accounts.howto.accountTitle")}</p>
          <p className={s.caseBody}>{t("accounts.howto.accountBody")}</p>
        </li>
        <li>
          <p className={s.caseTitle}>{t("accounts.howto.cookiesTitle")}</p>
          <p className={s.caseBody}>{t("accounts.howto.cookiesBody")}</p>
          <Button size="sm" variant="ghost" leadingIcon={ChevronUp} onClick={onGoToCookies}>
            {t("accounts.howto.cookiesAction")}
          </Button>
        </li>
        <li>
          <p className={s.caseTitle}>{t("accounts.howto.genericTitle")}</p>
          <p className={s.caseBody}>{t("accounts.howto.genericBody")}</p>
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={ExternalLink}
            onClick={() => open(YTDLP_ISSUES_URL)}
          >
            {t("accounts.howto.genericAction")}
          </Button>
        </li>
      </ol>
    </Section>
  );
}
