import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { Language } from "../ipc/types";
import en from "./en.json";
import es from "./es.json";

export type AppLocale = "es" | "en";

export const resources = {
  es: { translation: es },
  en: { translation: en },
} as const;

/** Resolves the "system" setting against the webview's languages. */
export function resolveLanguage(lang: Language, navLangs?: readonly string[]): AppLocale {
  if (lang === "es" || lang === "en") return lang;
  const list =
    navLangs ??
    (typeof navigator !== "undefined" ? (navigator.languages ?? [navigator.language]) : []);
  for (const l of list) {
    const base = l.toLowerCase().split("-")[0];
    if (base === "es" || base === "en") return base;
  }
  return "es";
}

/** BCP 47 tag for Intl formatting. */
export function intlLocale(locale: AppLocale): string {
  return locale === "es" ? "es" : "en";
}

let initialized = false;

export function setupI18n(lang: Language = "system") {
  const lng = resolveLanguage(lang);
  if (!initialized) {
    initialized = true;
    void i18n.use(initReactI18next).init({
      resources,
      lng,
      fallbackLng: "es",
      interpolation: { escapeValue: false },
      returnNull: false,
      initAsync: false,
      showSupportNotice: false,
    });
  } else if (i18n.language !== lng) {
    void i18n.changeLanguage(lng);
  }
  if (typeof document !== "undefined") document.documentElement.lang = lng;
  return i18n;
}

export function setLanguage(lang: Language) {
  return setupI18n(lang);
}

export function currentLocale(): AppLocale {
  return i18n.language === "en" ? "en" : "es";
}

export default i18n;
