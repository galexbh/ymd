import { useEffect, useMemo, useState } from "react";
import { KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api, toCommandError } from "../../ipc/commands";
import type { CommandError, SiteCredential } from "../../ipc/types";
import {
  COOKIES_ONLY,
  accountSites,
  fold,
  normalizeSiteKey,
  type AccountSite,
} from "../../data/supportedSites";
import {
  Button,
  Combobox,
  Icon,
  IconButton,
  Ledger,
  LedgerBody,
  LedgerCell,
  LedgerHead,
  LedgerHeaderCell,
  LedgerRow,
  Notice,
  Section,
  Skeleton,
  Tag,
  TextField,
  type ComboboxOption,
} from "../../ui";
import screen from "../shared/screen.module.css";
import s from "./settings.module.css";

/** Picker value for the free-text escape hatch. */
export const OTHER_SITE = "__other__";

const SITES: AccountSite[] = accountSites();
const BY_KEY = new Map(SITES.map((site) => [site.key, site]));
const OPTIONS: ComboboxOption[] = SITES.filter((site) => !COOKIES_ONLY.has(site.key)).map(
  (site) => ({
    value: site.key,
    label: site.name,
    description: site.description || undefined,
    meta: site.key,
    keywords: site.extractors,
  }),
);

const mentionsCookiesOnly = (text: string) => {
  const q = fold(text.trim());
  return q.length >= 3 && [...COOKIES_ONLY].some((k) => k.startsWith(q) || q.includes(k));
};

export function SiteAccounts({ onGoToCookies }: { onGoToCookies: () => void }) {
  const { t } = useTranslation();
  const [list, setList] = useState<SiteCredential[] | null>(null);
  const [site, setSite] = useState<string | null>(null);
  const [customKey, setCustomKey] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<CommandError | null>(null);

  useEffect(() => {
    api
      .credentialsList()
      .then(setList)
      .catch(() => setList([]));
  }, []);

  const other = site === OTHER_SITE;
  const customValid = normalizeSiteKey(customKey);
  const extractor = other ? customValid : site;
  const keyError = other && customKey.trim() && !customValid ? t("accounts.sites.keyInvalid") : "";

  const extraOptions = useMemo<ComboboxOption[]>(
    () => [
      {
        value: OTHER_SITE,
        label: t("accounts.sites.other"),
        description: t("accounts.sites.otherDesc"),
      },
    ],
    [t],
  );

  const youtubeNote = (
    <Notice
      tone="info"
      live={false}
      title={t("accounts.sites.youtubeTitle")}
      actions={[{ label: t("accounts.sites.goToCookies"), onClick: onGoToCookies }]}
    >
      {t("accounts.sites.youtubeBody")}
    </Notice>
  );

  const save = async () => {
    if (!extractor) return;
    setSaving(true);
    setError(null);
    try {
      setList(await api.credentialsSet(extractor, username.trim(), password));
      setSite(null);
      setCustomKey("");
      setUsername("");
    } catch (e) {
      setError(toCommandError(e));
    } finally {
      // the secret never outlives the request
      setPassword("");
      setSaving(false);
    }
  };

  return (
    <Section title={t("accounts.sites.title")} description={t("accounts.sites.description")}>
      {list === null ? (
        <Skeleton count={2} columns={[20, 40, 10]} />
      ) : list.length === 0 ? (
        <p className={screen.muted}>{t("accounts.sites.empty")}</p>
      ) : (
        <Ledger caption={t("accounts.sites.title")} data-testid="credentials-ledger">
          <LedgerHead>
            <tr>
              <LedgerHeaderCell>{t("accounts.sites.site")}</LedgerHeaderCell>
              <LedgerHeaderCell>{t("accounts.sites.username")}</LedgerHeaderCell>
              <LedgerHeaderCell className={s.cPresetActions}>
                <span className="visually-hidden">{t("ledger.col.actions")}</span>
              </LedgerHeaderCell>
            </tr>
          </LedgerHead>
          <LedgerBody>
            {list.map((c) => {
              const known = BY_KEY.get(c.extractor);
              return (
                <LedgerRow key={c.extractor} data-testid={`credential-${c.extractor}`}>
                  <LedgerCell>
                    <span className={s.siteCell}>
                      {known && known.name !== c.extractor && (
                        <span className={s.siteName}>{known.name}</span>
                      )}
                      <Tag mono>{c.extractor}</Tag>
                    </span>
                  </LedgerCell>
                  <LedgerCell truncate>{c.username}</LedgerCell>
                  <LedgerCell>
                    <div className={screen.actionsCell}>
                      <IconButton
                        icon={Trash2}
                        size="sm"
                        aria-label={t("accounts.sites.deleteNamed", { site: c.extractor })}
                        onClick={async () => {
                          try {
                            setList(await api.credentialsDelete(c.extractor));
                          } catch (e) {
                            setError(toCommandError(e));
                          }
                        }}
                      />
                    </div>
                  </LedgerCell>
                </LedgerRow>
              );
            })}
          </LedgerBody>
        </Ledger>
      )}

      <form
        className={s.credForm}
        aria-label={t("accounts.sites.add")}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Combobox
          className={other ? s.credSite : s.credSiteWide}
          label={t("accounts.sites.site")}
          hint={t("accounts.sites.siteHint")}
          placeholder={t("accounts.sites.sitePlaceholder")}
          options={OPTIONS}
          extraOptions={extraOptions}
          value={site}
          onChange={(v) => {
            setSite(v);
            if (v !== OTHER_SITE) setCustomKey("");
          }}
          note={(query) => (mentionsCookiesOnly(query) ? youtubeNote : null)}
          data-testid="credential-site"
        />
        {other && (
          <div className={s.credSite}>
            <TextField
              label={t("accounts.sites.key")}
              hint={t("accounts.sites.keyHint")}
              error={keyError || undefined}
              mono
              value={customKey}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setCustomKey(e.target.value)}
              data-testid="credential-key"
            />
            {customValid && COOKIES_ONLY.has(customValid) && (
              <div className={s.credNote}>{youtubeNote}</div>
            )}
          </div>
        )}
        <TextField
          label={t("accounts.sites.username")}
          fieldClassName={s.credRowStart}
          value={username}
          autoComplete="off"
          onChange={(e) => setUsername(e.target.value)}
        />
        <TextField
          label={t("accounts.sites.password")}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="credential-password"
        />
        <Button
          type="submit"
          variant="secondary"
          leadingIcon={KeyRound}
          loading={saving}
          disabled={!extractor || !username.trim() || !password}
          className={s.credSubmit}
        >
          {t("accounts.sites.save")}
        </Button>
      </form>
      {error && <Notice tone="error" title={t("accounts.sites.failed")} detail={error.detail} />}
      <p className={s.privacy}>
        <Icon icon={ShieldCheck} size={16} />
        <span>{t("accounts.sites.keychain")}</span>
      </p>
    </Section>
  );
}
