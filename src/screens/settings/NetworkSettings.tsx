import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { IpVersion, NetworkSettings as Network } from "../../ipc/types";
import { SegmentedControl, Section, Select, TextField } from "../../ui";
import { useSettings } from "../../store/settings";
import { RATE_PRESETS, isRatePreset, parseRate } from "./constants";
import { RETRY_PRESETS, TIMEOUT_PRESETS, checkProxy } from "./network";
import s from "./settings.module.css";

const RATE_NONE = "none";
const RATE_OTHER = "other";
/** «Predeterminado de yt-dlp» in the timeout and retry selects. */
const DEFAULT = "default";

/** «Límite de velocidad»: common caps, or «Otro…» with a numeric field (saved debounced). */
export function SpeedLimitField() {
  const { t } = useTranslation();
  const limit = useSettings((st) => st.settings!.limitRateMbps);
  const update = useSettings((st) => st.update);
  // «Otro…» stays chosen while typing, even before the number is valid
  const [other, setOther] = useState(() => limit !== null && !isRatePreset(limit));
  const [draft, setDraft] = useState<string | null>(null);
  const showOther = other || (limit !== null && !isRatePreset(limit));
  const value = showOther ? RATE_OTHER : limit === null ? RATE_NONE : String(limit);
  const text = draft ?? (limit === null ? "" : String(limit));
  const invalid = showOther && text.trim() !== "" && parseRate(text) === null;

  return (
    <div className={s.fieldStack}>
      <Select
        label={t("settings.network.limitRate")}
        hint={t("settings.network.limitRateHint")}
        value={value}
        data-testid="settings-limit-rate"
        onChange={(e) => {
          const v = e.target.value;
          setDraft(null);
          if (v === RATE_OTHER) {
            setOther(true);
            return;
          }
          setOther(false);
          update({ limitRateMbps: v === RATE_NONE ? null : Number(v) });
        }}
        options={[
          { value: RATE_NONE, label: t("settings.network.limitRateNone") },
          ...RATE_PRESETS.map((n) => ({
            value: String(n),
            label: t("settings.network.limitRateValue", { n }),
          })),
          { value: RATE_OTHER, label: t("settings.network.limitRateOther") },
        ]}
      />
      {showOther && (
        <TextField
          label={t("settings.network.limitRateCustom")}
          mono
          inputMode="numeric"
          autoComplete="off"
          value={text}
          trailing="MB/s"
          error={invalid ? t("settings.network.limitRateInvalid") : undefined}
          data-testid="settings-limit-rate-custom"
          onChange={(e) => {
            setDraft(e.target.value);
            const n = parseRate(e.target.value);
            if (n !== null) update({ limitRateMbps: n }, { debounce: 500 });
          }}
        />
      )}
    </div>
  );
}

/**
 * «Proxy»: saved when the field loses focus (or on Enter), and only when valid, so a half-typed
 * address such as `http://u` never becomes the live proxy. Clearing the field removes it.
 */
function ProxyField() {
  const { t } = useTranslation();
  const proxy = useSettings((st) => st.settings!.network.proxy);
  const update = useSettings((st) => st.update);
  // local draft while typing; invalid drafts are never saved
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? proxy ?? "";
  const check = checkProxy(text);
  const commit = () => {
    if (draft === null) return;
    const c = checkProxy(draft);
    if (c.kind !== "ok" && c.kind !== "empty") return;
    const value = c.kind === "ok" ? c.value : null;
    setDraft(null);
    if (value !== proxy) update((x) => ({ ...x, network: { ...x.network, proxy: value } }));
  };
  const error =
    check.kind === "credentials"
      ? t("settings.network.proxyCredentials")
      : check.kind === "invalid"
        ? t("settings.network.proxyInvalid")
        : undefined;

  return (
    <TextField
      label={t("settings.network.proxy")}
      mono
      autoComplete="off"
      spellCheck={false}
      placeholder="socks5://127.0.0.1:1080"
      value={text}
      hint={t("settings.network.proxyHint")}
      error={error}
      data-testid="settings-proxy"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}

function numberOrDefault(v: string): number | null {
  return v === DEFAULT ? null : Number(v);
}

export function NetworkSettings() {
  const { t } = useTranslation();
  const network = useSettings((st) => st.settings!.network);
  const update = useSettings((st) => st.update);
  const set = (patch: Partial<Network>) =>
    update((x) => ({ ...x, network: { ...x.network, ...patch } }));
  // A value outside the presets (from an older or hand-edited file) still shows as itself.
  const timeouts = [...TIMEOUT_PRESETS] as number[];
  if (network.socketTimeoutS !== null && !timeouts.includes(network.socketTimeoutS)) {
    timeouts.push(network.socketTimeoutS);
    timeouts.sort((a, b) => a - b);
  }
  const retries = [...RETRY_PRESETS] as number[];
  if (network.retries !== null && !retries.includes(network.retries)) {
    retries.push(network.retries);
    retries.sort((a, b) => a - b);
  }

  return (
    <>
      <Section title={t("settings.network.proxyTitle")} description={t("settings.network.intro")}>
        <ProxyField />
      </Section>

      <Section title={t("settings.network.connection")}>
        <div className={s.fieldStack}>
          <span className={s.fieldLabel}>{t("settings.network.ipVersion")}</span>
          <SegmentedControl<IpVersion>
            label={t("settings.network.ipVersion")}
            value={network.ipVersion}
            onChange={(ipVersion) => set({ ipVersion })}
            options={[
              { value: "auto", label: t("settings.network.ipModes.auto") },
              { value: "v4", label: t("settings.network.ipModes.v4") },
              { value: "v6", label: t("settings.network.ipModes.v6") },
            ]}
          />
          <p className={s.fieldHint}>{t("settings.network.ipHint")}</p>
        </div>
        {/* sized to their content, like «Límite de velocidad» */}
        <div className={s.fieldStack}>
          <Select
            label={t("settings.network.timeout")}
            hint={t("settings.network.timeoutHint")}
            value={network.socketTimeoutS === null ? DEFAULT : String(network.socketTimeoutS)}
            data-testid="settings-timeout"
            onChange={(e) => set({ socketTimeoutS: numberOrDefault(e.target.value) })}
            options={[
              { value: DEFAULT, label: t("settings.network.default") },
              ...timeouts.map((n) => ({
                value: String(n),
                label: t("settings.network.timeoutValue", { n }),
              })),
            ]}
          />
        </div>
        <div className={s.fieldStack}>
          <Select
            label={t("settings.network.retries")}
            hint={t("settings.network.retriesHint")}
            value={network.retries === null ? DEFAULT : String(network.retries)}
            data-testid="settings-retries"
            onChange={(e) => set({ retries: numberOrDefault(e.target.value) })}
            options={[
              { value: DEFAULT, label: t("settings.network.default") },
              ...retries.map((n) => ({ value: String(n), label: String(n) })),
            ]}
          />
        </div>
      </Section>

      <Section title={t("settings.network.speed")}>
        <SpeedLimitField />
      </Section>
    </>
  );
}
