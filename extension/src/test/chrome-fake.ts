// An in-memory `chrome.*` for unit tests. It follows the real semantics where they matter:
// getAll({domain}) matches subdomains and is limited by granted host permissions, storage
// fires onChanged, sendNativeMessage sets runtime.lastError only during its callback, and
// i18n reads the real _locales files with their placeholders.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Alarm,
  type ChromeApi,
  type ChromeCookie,
  type ChromeEvent,
  type CookieChangeInfo,
  type StorageChange,
  type MenuClickInfo,
  type MenuProperties,
  type Tab,
} from "../lib/chrome-api";

const here = dirname(fileURLToPath(import.meta.url));
export const EXTENSION_DIR = resolve(here, "../..");
/** The real manifest version (extension/manifest.json), as `runtime.getManifest()` reports it. */
export const MANIFEST_VERSION = (
  JSON.parse(readFileSync(resolve(EXTENSION_DIR, "manifest.json"), "utf8")) as { version: string }
).version;

export type Locale = "es" | "en";

interface MessageEntry {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

export function loadMessages(locale: Locale): Record<string, MessageEntry> {
  return JSON.parse(
    readFileSync(resolve(EXTENSION_DIR, "_locales", locale, "messages.json"), "utf8"),
  ) as Record<string, MessageEntry>;
}

/** chrome.i18n.getMessage: named placeholders ($NAME$ → content "$1") and raw $1…$9. */
export function formatMessage(entry: MessageEntry | undefined, subs: string[]): string {
  if (!entry) return "";
  const fill = (s: string) => s.replace(/\$(\d)/g, (_, n: string) => subs[Number(n) - 1] ?? "");
  return entry.message.replace(/\$([A-Za-z0-9_@]+)\$/g, (_, name: string) => {
    const ph = entry.placeholders?.[name.toLowerCase()];
    return ph ? fill(ph.content) : "";
  });
}

export interface FakeEvent<T extends (...args: never[]) => unknown> extends ChromeEvent<T> {
  listeners: T[];
  emit(...args: Parameters<T>): unknown[];
}

export function fakeEvent<T extends (...args: never[]) => unknown>(): FakeEvent<T> {
  const listeners: T[] = [];
  return {
    listeners,
    addListener: (cb) => void listeners.push(cb),
    removeListener: (cb) => {
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    },
    emit: (...args) => listeners.map((l) => l(...args)),
  };
}

/** What the fake native host does with a message: reply, or fail like the browser would. */
export type NativeOutcome = { reply: unknown } | { lastError: string } | { hang: true };
/** `{ hang: true }`: the host never answers (a stuck ymd); the callback is never called. */
export type NativeBehavior = NativeOutcome | ((message: Record<string, unknown>) => NativeOutcome);

export const HOST_NOT_FOUND = "Specified native messaging host not found.";

/** ID of the fake extension; the popup sends from its own page. */
export const FAKE_ID = "fakeextensionidfakeextensionidaa";
export const POPUP_SENDER = { id: FAKE_ID, url: `chrome-extension://${FAKE_ID}/popup.html` };

export interface FakeOptions {
  cookies?: ChromeCookie[];
  locale?: Locale;
  native?: NativeBehavior;
  /** Answer of permissions.request (the user's click in the prompt). */
  grant?: boolean;
  storage?: Record<string, unknown>;
  /** chrome.storage.session contents (what an earlier run of the worker left). */
  session?: Record<string, unknown>;
  /** Sites already on the list, with their permission granted (as after adding them). */
  sites?: string[];
  /** Sites on the list whose permission is gone (revoked in the browser, or lost on an update). */
  revoked?: string[];
  /** The active tab the popup sees (via activeTab). */
  activeTab?: { url?: string };
  /**
   * The manifest's required host permissions, granted on load. Default: none (like the store
   * build); `["*://*.youtube.com/*"]` is the build ymd ships.
   */
  hostPermissions?: string[];
  /** Whether the extension is pinned to the toolbar (action.getUserSettings). */
  pinned?: boolean;
}

/** The required host permissions of the build ymd ships. */
export const SHIPPED_HOSTS = ["*://*.youtube.com/*"];

function patternCovers(pattern: string, host: string): boolean {
  if (pattern === "*://*/*" || pattern === "<all_urls>") return true;
  const m = /^\*:\/\/\*\.([^/]+)\/\*$/.exec(pattern);
  if (!m) return false;
  return host === m[1] || host.endsWith(`.${m[1]}`);
}

export function cookie(partial: Partial<ChromeCookie> & { name: string }): ChromeCookie {
  return {
    value: `v-${partial.name}`,
    domain: ".youtube.com",
    hostOnly: false,
    path: "/",
    secure: true,
    httpOnly: false,
    session: false,
    expirationDate: 1_900_000_000,
    sameSite: "lax",
    storeId: "0",
    ...partial,
  };
}

export function createChromeFake(options: FakeOptions = {}) {
  const jar: ChromeCookie[] = [...(options.cookies ?? [])];
  const store = new Map<string, unknown>(Object.entries(options.storage ?? {}));
  const session = new Map<string, unknown>(Object.entries(options.session ?? {}));
  const alarms = new Map<string, Alarm>();
  const required = [...(options.hostPermissions ?? [])];
  const granted = new Set<string>(required);
  let pinned = options.pinned ?? false;
  for (const site of options.sites ?? []) granted.add(`*://*.${site}/*`);
  if (options.sites && !store.has("allowlist")) store.set("allowlist", [...options.sites]);
  // A stored list means the person added those sites, so their permissions were granted.
  const stored = store.get("allowlist");
  if (Array.isArray(stored)) for (const site of stored) granted.add(`*://*.${String(site)}/*`);
  for (const site of options.revoked ?? []) granted.delete(`*://*.${site}/*`);
  const locale = options.locale ?? "es";
  const messages = loadMessages(locale);

  const events = {
    cookiesChanged: fakeEvent<(info: CookieChangeInfo) => void>(),
    storageChanged: fakeEvent<(changes: Record<string, StorageChange>, areaName: string) => void>(),
    alarm: fakeEvent<(alarm: Alarm) => void>(),
    message:
      fakeEvent<
        (
          message: unknown,
          sender: { id?: string; url?: string },
          sendResponse: (r?: unknown) => void,
        ) => boolean | undefined | void
      >(),
    installed: fakeEvent<(details: { reason: string }) => void>(),
    startup: fakeEvent<() => void>(),
    menuClicked: fakeEvent<(info: MenuClickInfo, tab?: Tab) => void>(),
    /** Keyboard shortcuts (`commands` in the manifest). */
    command: fakeEvent<(command: string, tab?: Tab) => void>(),
  };

  const record = {
    native: [] as Array<{ host: string; message: Record<string, unknown> }>,
    getAll: [] as Array<{ domain?: string }>,
    permissionRequests: [] as string[][],
    /** The toolbar badge as last set. */
    badge: { text: "", color: null as string | null, title: "ymd Cookies" },
    /** Context menu items currently created. */
    menus: [] as MenuProperties[],
    permissionRemovals: [] as string[][],
    /** Tabs opened with tabs.create. */
    tabsCreated: [] as string[],
  };

  let native: NativeBehavior = options.native ?? { reply: { ok: true, count: 0, domains: [] } };
  let grant = options.grant ?? true;

  const runtime: ChromeApi["runtime"] = {
    lastError: undefined,
    sendNativeMessage(host, message, callback) {
      const msg = JSON.parse(JSON.stringify(message)) as Record<string, unknown>;
      record.native.push({ host, message: msg });
      const outcome = typeof native === "function" ? native(msg) : native;
      if ("hang" in outcome) return;
      queueMicrotask(() => {
        if ("lastError" in outcome) {
          runtime.lastError = { message: outcome.lastError };
          try {
            callback(undefined);
          } finally {
            runtime.lastError = undefined;
          }
        } else {
          callback(outcome.reply);
        }
      });
    },
    id: FAKE_ID,
    getManifest: () => ({ version: MANIFEST_VERSION, host_permissions: [...required] }),
    getURL: (path: string) => `chrome-extension://${FAKE_ID}/${path.replace(/^\//, "")}`,
    sendMessage(message) {
      return new Promise((resolve) => {
        let answered = false;
        const results = events.message.emit(message, POPUP_SENDER, (r) => {
          answered = true;
          resolve(r);
        });
        if (!answered && !results.includes(true)) resolve(undefined);
      });
    },
    onMessage: events.message,
    onInstalled: events.installed,
    onStartup: events.startup,
  };

  const api: ChromeApi = {
    cookies: {
      async getAll({ domain }) {
        record.getAll.push({ domain });
        return jar
          .filter((c) => {
            const host = c.domain.replace(/^\./, "");
            if (![...granted].some((p) => patternCovers(p, host))) return false;
            if (!domain) return true;
            return host === domain || host.endsWith(`.${domain}`);
          })
          .map((c) => ({ ...c }));
      },
      onChanged: events.cookiesChanged,
    },
    storage: {
      local: {
        async get(keys) {
          const list = keys === null ? [...store.keys()] : Array.isArray(keys) ? keys : [keys];
          const out: Record<string, unknown> = {};
          for (const k of list) if (store.has(k)) out[k] = structuredClone(store.get(k));
          return out;
        },
        async set(items) {
          const changes: Record<string, StorageChange> = {};
          for (const [k, v] of Object.entries(items)) {
            changes[k] = { oldValue: store.get(k), newValue: structuredClone(v) };
            store.set(k, structuredClone(v));
          }
          events.storageChanged.emit(changes, "local");
        },
      },
      session: {
        async get(keys) {
          const list = keys === null ? [...session.keys()] : Array.isArray(keys) ? keys : [keys];
          const out: Record<string, unknown> = {};
          for (const k of list) if (session.has(k)) out[k] = structuredClone(session.get(k));
          return out;
        },
        async set(items) {
          const changes: Record<string, StorageChange> = {};
          for (const [k, v] of Object.entries(items)) {
            changes[k] = { oldValue: session.get(k), newValue: structuredClone(v) };
            session.set(k, structuredClone(v));
          }
          events.storageChanged.emit(changes, "session");
        },
        async remove(keys) {
          const changes: Record<string, StorageChange> = {};
          for (const k of Array.isArray(keys) ? keys : [keys]) {
            if (!session.has(k)) continue;
            changes[k] = { oldValue: session.get(k) };
            session.delete(k);
          }
          if (Object.keys(changes).length > 0) events.storageChanged.emit(changes, "session");
        },
      },
      onChanged: events.storageChanged,
    },
    alarms: {
      create(name, info) {
        alarms.set(name, {
          name,
          periodInMinutes: info.periodInMinutes,
          scheduledTime: Date.now() + (info.delayInMinutes ?? info.periodInMinutes ?? 0) * 60_000,
        });
      },
      async get(name) {
        return alarms.get(name);
      },
      onAlarm: events.alarm,
    },
    runtime,
    contextMenus: {
      create(properties: MenuProperties, callback?: () => void) {
        const duplicate = record.menus.some((m) => m.id === properties.id);
        if (!duplicate) record.menus.push(structuredClone(properties));
        if (callback) {
          queueMicrotask(() => {
            if (duplicate)
              runtime.lastError = {
                message: `Cannot create item with duplicate id ${properties.id}`,
              };
            try {
              callback();
            } finally {
              runtime.lastError = undefined;
            }
          });
        }
        return properties.id;
      },
      async removeAll() {
        record.menus.length = 0;
      },
      onClicked: events.menuClicked,
    },
    action: {
      async setBadgeText({ text }: { text: string }) {
        record.badge.text = text;
      },
      async setBadgeBackgroundColor({ color }: { color: string }) {
        record.badge.color = color;
      },
      async setTitle({ title }: { title: string }) {
        record.badge.title = title;
      },
      async getUserSettings() {
        return { isOnToolbar: pinned };
      },
    },
    commands: {
      onCommand: events.command,
    },
    tabs: {
      async query() {
        return options.activeTab ? [{ id: 1, ...options.activeTab }] : [];
      },
      async create({ url }: { url: string }) {
        record.tabsCreated.push(url);
        return { id: 2, url };
      },
    },
    permissions: {
      async request({ origins = [] }) {
        record.permissionRequests.push(origins);
        if (grant) origins.forEach((o) => granted.add(o));
        return grant;
      },
      async remove({ origins = [] }) {
        record.permissionRemovals.push(origins);
        if (origins.some((o) => required.includes(o))) {
          throw new Error("You cannot remove required permissions.");
        }
        origins.forEach((o) => granted.delete(o));
        return true;
      },
      async contains({ origins = [] }) {
        return origins.every((o) => granted.has(o));
      },
    },
    i18n: {
      getMessage(name, subs) {
        const list = subs === undefined ? [] : Array.isArray(subs) ? subs : [subs];
        return formatMessage(messages[name], list);
      },
      getUILanguage: () => (locale === "es" ? "es-419" : "en-US"),
    },
  };

  return {
    api,
    events,
    record,
    store,
    session,
    alarms,
    granted,
    jar,
    setNative(b: NativeBehavior) {
      native = b;
    },
    setGrant(g: boolean) {
      grant = g;
    },
    /** The person pins (or unpins) the extension in the toolbar. */
    setPinned(p: boolean) {
      pinned = p;
    },
    /** Changes the jar and fires cookies.onChanged like the browser. */
    setCookie(c: ChromeCookie) {
      const i = jar.findIndex(
        (x) => x.domain === c.domain && x.path === c.path && x.name === c.name,
      );
      if (i >= 0) jar[i] = c;
      else jar.push(c);
      events.cookiesChanged.emit({ removed: false, cookie: c, cause: "explicit" });
    },
  };
}

export type ChromeFake = ReturnType<typeof createChromeFake>;

/** Lets pending promise chains (and microtask native replies) run. */
export async function flush(times = 10): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise<void>((r) => setTimeout(r, 0));
}
