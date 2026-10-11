// The slice of the `chrome.*` extension API this extension uses, typed by hand so the package
// needs no `@types/chrome`. Production code receives it as a dependency (the real `chrome`
// global in the browser, `createChromeFake()` in tests), which keeps every module testable.

export interface ChromeCookie {
  name: string;
  value: string;
  domain: string;
  hostOnly: boolean;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  session: boolean;
  expirationDate?: number;
  sameSite?: string;
  storeId?: string;
}

export interface CookieChangeInfo {
  removed: boolean;
  cookie: ChromeCookie;
  cause: string;
}

export interface ChromeEvent<T extends (...args: never[]) => unknown> {
  addListener(callback: T): void;
  removeListener(callback: T): void;
}

export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

export interface Alarm {
  name: string;
  periodInMinutes?: number;
  scheduledTime: number;
}

export type MessageSender = { id?: string; url?: string };

export interface MenuClickInfo {
  menuItemId: string | number;
  linkUrl?: string;
  srcUrl?: string;
  /** The embedded document (iframe) right-clicked, e.g. a YouTube or Vimeo player. */
  frameUrl?: string;
  /** Selected text, when the selection itself is a link. */
  selectionText?: string;
  pageUrl?: string;
}

export interface MenuProperties {
  id: string;
  title: string;
  contexts: string[];
  documentUrlPatterns?: string[];
}

export interface Tab {
  id?: number;
  url?: string;
}

export interface ChromeApi {
  cookies: {
    getAll(details: { domain?: string }): Promise<ChromeCookie[]>;
    onChanged: ChromeEvent<(info: CookieChangeInfo) => void>;
  };
  storage: {
    local: {
      get(keys: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
    onChanged: ChromeEvent<(changes: Record<string, StorageChange>, areaName: string) => void>;
  };
  alarms: {
    create(name: string, info: { periodInMinutes?: number; delayInMinutes?: number }): unknown;
    get(name: string): Promise<Alarm | undefined>;
    onAlarm: ChromeEvent<(alarm: Alarm) => void>;
  };
  runtime: {
    /** This extension's ID. */
    id: string;
    /**
     * Only the required host permissions (they decide the preset sites) and the version (sent
     * to ymd with every sync) are read.
     */
    getManifest(): { version: string; host_permissions?: string[] };
    getURL(path: string): string;
    lastError?: { message?: string };
    // Callback form on purpose: it is the only form where `lastError` is readable everywhere.
    sendNativeMessage(
      application: string,
      message: object,
      callback: (response: unknown) => void,
    ): void;
    sendMessage(message: unknown): Promise<unknown>;
    onMessage: ChromeEvent<
      (
        message: unknown,
        sender: MessageSender,
        sendResponse: (response?: unknown) => void,
      ) => boolean | undefined | void
    >;
    onInstalled: ChromeEvent<(details: { reason: string }) => void>;
    onStartup: ChromeEvent<() => void>;
  };
  permissions: {
    request(permissions: { origins?: string[] }): Promise<boolean>;
    remove(permissions: { origins?: string[] }): Promise<boolean>;
    contains(permissions: { origins?: string[] }): Promise<boolean>;
  };
  i18n: {
    getMessage(name: string, substitutions?: string | string[]): string;
    getUILanguage(): string;
  };
  contextMenus: {
    create(properties: MenuProperties): unknown;
    removeAll(): Promise<void>;
    onClicked: ChromeEvent<(info: MenuClickInfo, tab?: Tab) => void>;
  };
  action: {
    setBadgeText(details: { text: string }): Promise<void>;
    setBadgeBackgroundColor(details: { color: string }): Promise<void>;
    setTitle(details: { title: string }): Promise<void>;
    /** Chrome 91+: whether the person pinned the extension to the toolbar. */
    getUserSettings?(): Promise<{ isOnToolbar?: boolean }>;
  };
  commands: {
    /** Keyboard shortcuts declared under `commands` in the manifest (no permission needed). */
    onCommand: ChromeEvent<(command: string, tab?: Tab) => void>;
  };
  tabs: {
    /** With `activeTab`, the active tab's `url` is readable while the popup is open. */
    query(query: { active?: boolean; currentWindow?: boolean }): Promise<Tab[]>;
    /** Opens the welcome page after a fresh install. */
    create(properties: { url: string }): Promise<unknown>;
  };
}

declare global {
  // The real browser global. Only the entry points (background.ts, popup.ts) read it.
  var chrome: ChromeApi;
}
