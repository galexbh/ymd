// ymd Cookies in a real Chromium: fixed ID, popup rendering, and a full Native Messaging round
// trip against a fake host (e2e/fake-host.mjs) registered for Playwright's Chromium.
//
// Host registration per OS:
// - Linux: <user-data-dir>/NativeMessagingHosts (Chromium's per-user dir follows
//   --user-data-dir) plus ~/.config/chromium/NativeMessagingHosts, removed afterwards.
// - macOS: <user-data-dir>/NativeMessagingHosts and
//   ~/Library/Application Support/Chromium/NativeMessagingHosts, removed afterwards.
// - Windows: a temp manifest plus HKCU\Software\Chromium\NativeMessagingHosts\com.ymd.cookies.
//   A value already there is backed up and restored.
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, test, type BrowserContext, type Worker } from "@playwright/test";
import { storeManifest } from "../src/lib/store-manifest";

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, "../dist");
const EXTENSION_ID = "gicaphbpepkphmeciigjhdpnbcaflfgd";
const ORIGIN = `chrome-extension://${EXTENSION_ID}/`;
const HOST = "com.ymd.cookies";
const REG_KEY = `HKCU\\Software\\Chromium\\NativeMessagingHosts\\${HOST}`;

interface Registration {
  cleanup(): void;
}

/** Writes the host wrapper + manifest and registers it where Chromium looks. */
function registerHost(work: string, userDataDir: string, recordFile: string): Registration {
  const script = resolve(here, "fake-host.mjs");
  const isWin = process.platform === "win32";
  const wrapper = join(work, isWin ? "fake-host.bat" : "fake-host.sh");
  if (isWin) {
    writeFileSync(
      wrapper,
      `@echo off\r\n"${process.execPath}" "${script}" "${recordFile}" "${ORIGIN}" %*\r\n`,
    );
  } else {
    writeFileSync(
      wrapper,
      `#!/bin/sh\nexec "${process.execPath}" "${script}" "${recordFile}" "${ORIGIN}" "$@"\n`,
    );
    chmodSync(wrapper, 0o755);
  }
  const manifest = JSON.stringify(
    {
      name: HOST,
      description: "ymd Cookies e2e fake host",
      path: wrapper,
      type: "stdio",
      allowed_origins: [ORIGIN],
    },
    null,
    2,
  );

  if (isWin) {
    const manifestPath = join(work, `${HOST}.json`);
    writeFileSync(manifestPath, manifest);
    let previous: string | null = null;
    try {
      const out = execFileSync("reg", ["query", REG_KEY, "/ve"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      previous = /REG_SZ\s+(.+)\s*$/m.exec(out)?.[1]?.trim() ?? null;
    } catch {
      previous = null;
    }
    execFileSync("reg", ["add", REG_KEY, "/ve", "/t", "REG_SZ", "/d", manifestPath, "/f"]);
    return {
      cleanup() {
        if (previous) {
          execFileSync("reg", ["add", REG_KEY, "/ve", "/t", "REG_SZ", "/d", previous, "/f"]);
        } else {
          execFileSync("reg", ["delete", REG_KEY, "/f"]);
        }
      },
    };
  }

  const userDir =
    process.platform === "darwin"
      ? join(homedir(), "Library/Application Support/Chromium/NativeMessagingHosts")
      : join(homedir(), ".config/chromium/NativeMessagingHosts");
  const written: string[] = [];
  for (const dir of [join(userDataDir, "NativeMessagingHosts"), userDir]) {
    const file = join(dir, `${HOST}.json`);
    if (dir === userDir && existsSync(file)) continue; // never clobber a real registration
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, manifest);
    written.push(file);
  }
  return { cleanup: () => written.forEach((f) => rmSync(f, { force: true })) };
}

function readRecord(file: string): Array<Record<string, unknown>> {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

test.describe.serial("ymd Cookies extension", () => {
  let work: string;
  let recordFile: string;
  let context: BrowserContext;
  let worker: Worker;
  let registration: Registration | null = null;
  let registrationError: string | null = null;

  test.beforeAll(async () => {
    if (!existsSync(join(DIST, "manifest.json"))) {
      throw new Error("extension/dist is missing: run `pnpm ext:build` before the e2e.");
    }
    work = mkdtempSync(join(tmpdir(), "ymd-cookies-e2e-"));
    recordFile = join(work, "record.jsonl");
    const userDataDir = join(work, "profile");
    mkdirSync(userDataDir, { recursive: true });
    try {
      registration = registerHost(work, userDataDir, recordFile);
    } catch (e) {
      registrationError = e instanceof Error ? e.message : String(e);
    }

    context = await chromium.launchPersistentContext(userDataDir, {
      // The "chromium" channel is the new headless mode, the one that runs extensions.
      channel: "chromium",
      headless: true,
      locale: "es-ES",
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, "--lang=es"],
      // On Linux Chromium takes its UI language (and so chrome.i18n) from the environment,
      // not from --lang.
      env: { ...process.env, LANGUAGE: "es", LANG: "es_ES.UTF-8", LC_ALL: "es_ES.UTF-8" },
    });
    worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  });

  test.afterAll(async () => {
    await context?.close();
    registration?.cleanup();
    if (work) rmSync(work, { recursive: true, force: true });
  });

  test("loads with the fixed extension ID", async () => {
    const url = new URL(worker.url());
    expect(url.protocol).toBe("chrome-extension:");
    expect(url.host).toBe(EXTENSION_ID);
    expect(url.pathname).toBe("/background.js");
  });

  test("a fresh install opens the welcome page, with YouTube already ready", async () => {
    const welcome = `chrome-extension://${EXTENSION_ID}/welcome.html`;
    await expect.poll(() => context.pages().map((p) => p.url())).toContain(welcome);
    const page = context.pages().find((p) => p.url() === welcome)!;
    await expect(page.locator("h1")).toHaveText("ymd Cookies está instalada");
    await expect(page.locator("#youtube-ready")).toBeVisible();
    await expect(page.locator("#use-youtube")).toBeHidden();
    await expect(page.locator("#step-sites")).toHaveAttribute("data-done", "true");
    await expect(page.locator("#other-list button")).toHaveText(["Vimeo", "SoundCloud", "Twitch"]);
    // A headless browser has no toolbar to pin to: the step stays open, the guide is there.
    await expect(page.locator(".mock")).toBeVisible();
    await page.close();
  });

  test("renders the popup", async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${EXTENSION_ID}/popup.html`);
    await expect(page.locator("h1")).toHaveText("ymd Cookies");
    await expect(page.locator("#send-now")).toHaveText(/Enviar ahora/);
    await expect(page.locator("#site-list li .domain")).toHaveText(["youtube.com"]);
    await expect(page.locator("#site-list .grant")).toHaveCount(0);
    // YouTube is on the list, so the other known sites are the suggestions.
    await expect(page.locator("#suggest-list button")).toHaveText([
      "Vimeo",
      "SoundCloud",
      "Twitch",
    ]);
    await expect(page.locator(".privacy")).toContainText("sin red");
    // Opened as a tab, the active page is the popup itself: nothing to add.
    // (The session row may show: the install-time sync already reached the fake host.)
    await expect(page.locator("#current")).toBeHidden();
    // Tokens applied: the stamp is drawn, the page has a themed ground.
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(["light", "dark"]).toContain(theme);
    await page.close();
  });

  test("sends seeded cookies to the native host and shows CONECTADA", async () => {
    test.skip(!!registrationError, `native host registration failed: ${registrationError}`);

    const expires = Math.floor(Date.now() / 1000) + 86_400;
    await context.addCookies([
      {
        name: "SID",
        value: "e2e-secret-sid",
        domain: ".youtube.com",
        path: "/",
        expires,
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      },
      {
        name: "PREF",
        value: "e2e-pref",
        domain: ".youtube.com",
        path: "/",
        expires,
        secure: true,
        httpOnly: false,
        sameSite: "Lax",
      },
      {
        name: "elsewhere",
        value: "must-not-travel",
        domain: ".example.com",
        path: "/",
        expires,
        secure: false,
        httpOnly: false,
        sameSite: "Lax",
      },
    ]);

    const page = await context.newPage();
    await page.goto(`chrome-extension://${EXTENSION_ID}/popup.html`);
    const sentBefore = readRecord(recordFile).filter((m) => m.type === "cookies").length;
    await page.locator("#send-now").click();
    // send-now always sends (it ignores the hash), so a new cookies message must arrive.
    await expect
      .poll(() => readRecord(recordFile).filter((m) => m.type === "cookies").length, {
        timeout: 15_000,
      })
      .toBeGreaterThan(sentBefore);
    await expect(page.locator("#send-now")).not.toHaveAttribute("aria-busy", "true");
    await expect(page.locator("#stamp")).toHaveAttribute("data-state", "connected");
    await expect(page.locator("#stamp-word")).toHaveText("CONECTADA", { useInnerText: true });
    await expect(page.locator("#notice")).toBeHidden();

    const messages = readRecord(recordFile);
    expect(messages.some((m) => "rejectedOrigin" in m)).toBe(false);
    const sent = messages.filter((m) => m.type === "cookies");
    const last = sent[sent.length - 1] as {
      version: number;
      browser: string;
      cookies: Array<{ name: string; value: string; domain: string; httpOnly: boolean }>;
    };
    expect(last.version).toBe(1);
    expect(["chromium", "chrome", "other"]).toContain(last.browser);
    expect(last.cookies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "SID",
          value: "e2e-secret-sid",
          domain: ".youtube.com",
          httpOnly: true,
        }),
        expect.objectContaining({ name: "PREF", value: "e2e-pref", domain: ".youtube.com" }),
      ]),
    );
    expect(last.cookies.some((c) => c.name === "elsewhere")).toBe(false);
    await expect(page.locator("#count")).toHaveText(String(last.cookies.length));

    // What the extension keeps: status and a hash, never a cookie value.
    const stored = await worker.evaluate(() =>
      (
        globalThis as unknown as {
          chrome: { storage: { local: { get(k: null): Promise<unknown> } } };
        }
      ).chrome.storage.local.get(null),
    );
    const dump = JSON.stringify(stored);
    expect(dump).not.toContain("e2e-secret-sid");
    expect(dump).not.toContain("e2e-pref");
    expect(dump).toContain('"error":null');
    // SID + PREF but no LOGIN_INFO/SAPISID: signed out, so the icon says so
    expect(dump).toContain('"sessions":{"youtube.com":false}');
    const badge = await worker.evaluate(() =>
      (
        globalThis as unknown as {
          chrome: { action: { getBadgeText(d: object): Promise<string> } };
        }
      ).chrome.action.getBadgeText({}),
    );
    expect(badge).toBe("!");
    await expect(page.locator("#session-youtube")).toHaveText("Cerrada: inicia sesión en YouTube");
    await page.close();
  });

  test("the «Descargar con ymd» menu exists and a link reaches ymd", async () => {
    test.skip(!!registrationError, `native host registration failed: ${registrationError}`);
    // the menu is created on install
    const menus = await worker.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const c = (
            globalThis as unknown as {
              chrome: {
                contextMenus: { update(id: string, p: object, cb: () => void): void };
                runtime: { lastError?: unknown };
              };
            }
          ).chrome;
          c.contextMenus.update("ymd-download", {}, () => resolve(c.runtime.lastError ? 0 : 1));
        }),
    );
    expect(menus).toBe(1);

    // A right-click on YouTube's player: the <video> is a blob: URL, so the page goes to ymd.
    // Chromium can't open a context menu headless; the click event is dispatched directly.
    const url = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
    await worker.evaluate(
      (u) =>
        (
          globalThis as unknown as {
            chrome: { contextMenus: { onClicked: { dispatch(info: object, tab?: object): void } } };
          }
        ).chrome.contextMenus.onClicked.dispatch({
          menuItemId: "ymd-download",
          srcUrl: "blob:https://www.youtube.com/0b1c",
          pageUrl: u,
        }),
      url,
    );
    await expect
      .poll(() => readRecord(recordFile).filter((m) => m.type === "open"))
      .toEqual([{ type: "open", version: 1, url }]);

    // the Alt+Shift+Y shortcut is registered with the browser
    const commands = await worker.evaluate(() =>
      (
        globalThis as unknown as {
          chrome: { commands: { getAll(): Promise<Array<{ name?: string; shortcut?: string }>> } };
        }
      ).chrome.commands.getAll(),
    );
    expect(commands.find((c) => c.name === "download-page")?.shortcut).toMatch(/Y$/);
  });

  test("the popup has no download button and no «Esta página» on its own page", async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${EXTENSION_ID}/popup.html`);
    await expect(page.locator("#download-page")).toHaveCount(0);
    await expect(page.locator("#current")).toBeHidden();
    await page.close();
  });
});

// The Chrome Web Store package: same code, no `key` (another ID) and no preset site.
test.describe.serial("ymd Cookies extension, store package", () => {
  let work: string;
  let context: BrowserContext;
  let id: string;

  test.beforeAll(async () => {
    work = mkdtempSync(join(tmpdir(), "ymd-cookies-store-e2e-"));
    const extDir = join(work, "extension");
    cpSync(DIST, extDir, { recursive: true });
    const manifest = JSON.parse(readFileSync(join(extDir, "manifest.json"), "utf8")) as Record<
      string,
      unknown
    >;
    writeFileSync(join(extDir, "manifest.json"), JSON.stringify(storeManifest(manifest), null, 2));
    context = await chromium.launchPersistentContext(join(work, "profile"), {
      channel: "chromium",
      headless: true,
      locale: "es-ES",
      args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`, "--lang=es"],
      env: { ...process.env, LANGUAGE: "es", LANG: "es_ES.UTF-8", LC_ALL: "es_ES.UTF-8" },
    });
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    id = new URL(worker.url()).host;
  });

  test.afterAll(async () => {
    await context?.close();
    if (work) rmSync(work, { recursive: true, force: true });
  });

  test("starts with no site: the welcome page offers «Usar YouTube»", async () => {
    expect(id).not.toBe(EXTENSION_ID);
    const welcome = `chrome-extension://${id}/welcome.html`;
    await expect.poll(() => context.pages().map((p) => p.url())).toContain(welcome);
    const page = context.pages().find((p) => p.url() === welcome)!;
    await expect(page.locator("#use-youtube")).toBeVisible();
    await expect(page.locator("#youtube-ready")).toBeHidden();
    await expect(page.locator("#step-sites")).toHaveAttribute("data-done", "false");

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(popup.locator("#site-list li")).toHaveCount(0);
    await expect(popup.locator("#sites-empty")).toBeVisible();
    await expect(popup.locator("#suggest-list button")).toHaveText([
      "YouTube",
      "Vimeo",
      "SoundCloud",
      "Twitch",
    ]);
  });
});
