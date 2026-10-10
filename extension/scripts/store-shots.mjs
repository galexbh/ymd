// Chrome Web Store screenshots (1280×800): the real popup, loaded in Chromium with a connected
// state, framed on a plain page. Writes extension/store/<locale>-<scheme>.png.
//
//   pnpm ext:build && pnpm ext:shots
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, "../dist");
const OUT = resolve(here, "../store");

if (!existsSync(join(DIST, "manifest.json"))) {
  console.error("extension/dist is missing: run `pnpm ext:build` first.");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const COPY = {
  es: {
    title: "Tus sesiones, de tu navegador a ymd",
    body: "Descarga con tu cuenta de YouTube sin exportar archivos. Las cookies viajan solo a ymd, en tu equipo, sin red.",
  },
  en: {
    title: "Your sessions, from your browser to ymd",
    body: "Download with your YouTube account without exporting files. Cookies travel only to ymd, on your computer, with no network.",
  },
};
const THEME = {
  light: { ground: "#eef1f1", ink: "#1b2427", muted: "#4d5c62", rule: "#cbd4d7" },
  dark: { ground: "#151d20", ink: "#f2f5f5", muted: "#9eacb1", rule: "#2f3c42" },
};

async function shoot(locale, scheme) {
  const userDataDir = mkdtempSync(join(tmpdir(), "ymd-shots-"));
  const lang = locale === "es" ? "es-ES" : "en-US";
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    locale: lang,
    colorScheme: scheme,
    viewport: { width: 380, height: 640 },
    deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, `--lang=${locale}`],
    env: { ...process.env, LANGUAGE: locale, LANG: `${lang.replace("-", "_")}.UTF-8` },
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    const id = new URL(worker.url()).host;
    // The install-time sync (no ymd here) writes its own status first; let it finish.
    await new Promise((r) => setTimeout(r, 2000));
    const now = Date.now();
    await worker.evaluate((state) => globalThis.chrome.storage.local.set(state), {
      allowlist: ["youtube.com", "vimeo.com"],
      allowlistVersion: 2,
      status: {
        lastSyncAt: now - 4 * 60_000,
        checkedAt: now - 4 * 60_000,
        count: 42,
        domains: ["youtube.com", "vimeo.com"],
        error: null,
        sessions: { "youtube.com": true },
      },
    });
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.waitForSelector("#stamp[data-state='connected']");
    const shot = await popup.locator("main.popup").screenshot();

    const c = THEME[scheme];
    const frame = await context.newPage();
    await frame.setViewportSize({ width: 1280, height: 800 });
    await frame.setContent(`<!doctype html><html lang="${locale}"><body style="margin:0;width:1280px;height:800px;
      background:${c.ground};color:${c.ink};font-family:'Segoe UI',system-ui,sans-serif;display:flex;
      align-items:center;gap:72px;padding:0 96px;box-sizing:border-box">
      <div style="flex:1;max-width:560px">
        <p style="margin:0 0 20px;font:600 14px/1 ui-monospace,Consolas,monospace;letter-spacing:.14em;
          text-transform:uppercase;color:${c.muted}">ymd Cookies</p>
        <h1 style="margin:0 0 20px;font-size:44px;line-height:1.15;font-weight:650">${COPY[locale].title}</h1>
        <p style="margin:0;font-size:20px;line-height:1.5;color:${c.muted}">${COPY[locale].body}</p>
      </div>
      <img alt="" src="data:image/png;base64,${shot.toString("base64")}"
        style="width:380px;border:1px solid ${c.rule};border-radius:12px;box-shadow:0 24px 60px rgb(0 0 0 / .18)">
    </body></html>`);
    const file = join(OUT, `${locale}-${scheme}.png`);
    await frame.screenshot({ path: file });
    console.info(`store/${locale}-${scheme}.png`);
  } finally {
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

for (const locale of ["es", "en"]) {
  for (const scheme of ["light", "dark"]) await shoot(locale, scheme);
}
