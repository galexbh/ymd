// Chrome Web Store graphics, all JPEG (24-bit, no alpha, as the store asks):
//   store/screenshot-<locale>-<scheme>.jpg  1280×800  the real popup, connected, on a plain page
//   store/screenshot-welcome-<locale>.jpg   1280×800  the welcome page of the store package
//   store/tile-small.jpg                    440×280   small promo tile
//   store/tile-marquee.jpg                  1400×560  marquee promo tile
//
//   pnpm ext:build && pnpm ext:shots
import { chromium } from "@playwright/test";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { storeManifest } from "../src/lib/store-manifest.ts";

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, "../dist");
const OUT = resolve(here, "../store");
const ISOTYPE_DARK = readFileSync(resolve(here, "../../docs/assets/ymd-isotype-dark.svg"), "utf8");

if (!existsSync(join(DIST, "manifest.json"))) {
  console.error("extension/dist is missing: run `pnpm ext:build` first.");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const COPY = {
  es: {
    title: "Tus sesiones, de tu navegador a ymd",
    body: "Descarga con tu propia sesión, sin exportar archivos. Las cookies viajan solo a ymd, en tu equipo, sin red.",
    welcomeTitle: "Dos pasos y listo",
    welcomeBody:
      "Al instalarla, una página te guía para fijarla en la barra y elegir los sitios. Cada sitio pide su propio permiso.",
  },
  en: {
    title: "Your sessions, from your browser to ymd",
    body: "Download with your own session, without exporting files. Cookies travel only to ymd, on your computer, with no network.",
    welcomeTitle: "Two steps and you're done",
    welcomeBody:
      "Once installed, a page guides you to pin it to the toolbar and choose your sites. Each site asks for its own permission.",
  },
};
const THEME = {
  light: { ground: "#eef1f1", ink: "#1b2427", muted: "#4d5c62", rule: "#cbd4d7" },
  dark: { ground: "#151d20", ink: "#f2f5f5", muted: "#9eacb1", rule: "#2f3c42" },
};
const FONT = "'Segoe UI',system-ui,sans-serif";
const MONO = "ui-monospace,Consolas,monospace";

/** The real popup, connected, as a 2× PNG (only an input to the JPEGs below). */
async function popupShot(locale, scheme) {
  const userDataDir = mkdtempSync(join(tmpdir(), "ymd-shots-"));
  // The shown sites as already added: youtube.com comes in the manifest; vimeo.com is granted
  // in a copy of dist (a script cannot click the browser's permission prompt).
  const ext = join(userDataDir, "extension");
  cpSync(DIST, ext, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(ext, "manifest.json"), "utf8"));
  manifest.host_permissions = ["*://*.youtube.com/*", "*://*.vimeo.com/*"];
  writeFileSync(join(ext, "manifest.json"), JSON.stringify(manifest, null, 2));
  const lang = locale === "es" ? "es-ES" : "en-US";
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    locale: lang,
    colorScheme: scheme,
    viewport: { width: 380, height: 640 },
    deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, `--lang=${locale}`],
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
    return await popup.locator("main.popup").screenshot();
  } finally {
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

/** The welcome page a store install opens, as a 2× PNG of its main column. */
async function welcomeShot(locale) {
  const userDataDir = mkdtempSync(join(tmpdir(), "ymd-shots-"));
  const ext = join(userDataDir, "extension");
  cpSync(DIST, ext, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(ext, "manifest.json"), "utf8"));
  writeFileSync(join(ext, "manifest.json"), JSON.stringify(storeManifest(manifest), null, 2));
  const lang = locale === "es" ? "es-ES" : "en-US";
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    locale: lang,
    colorScheme: "light",
    viewport: { width: 760, height: 1200 },
    deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, `--lang=${locale}`],
    env: { ...process.env, LANGUAGE: locale, LANG: `${lang.replace("-", "_")}.UTF-8` },
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    const id = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/welcome.html`);
    await page.waitForSelector("#use-youtube:not([hidden])");
    return await page.locator("main.welcome").screenshot();
  } finally {
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

const img = (png, width, c) =>
  `<img alt="" src="data:image/png;base64,${png.toString("base64")}" style="width:${width}px;
   border:1px solid ${c.rule};border-radius:12px;box-shadow:0 24px 60px rgb(0 0 0 / .18)">`;

const mark = (size) =>
  ISOTYPE_DARK.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);

async function render(browser, name, width, height, html) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;width:${width}px;height:${height}px;overflow:hidden">${html}</body></html>`,
  );
  await page.screenshot({ path: join(OUT, name), type: "jpeg", quality: 92 });
  await page.close();
  console.info(`store/${name}`);
}

const shots = {};
const welcome = {};
for (const locale of ["es", "en"]) {
  welcome[locale] = await welcomeShot(locale);
  for (const scheme of ["light", "dark"]) {
    shots[`${locale}-${scheme}`] = await popupShot(locale, scheme);
  }
}

const browser = await chromium.launch();
try {
  for (const [key, png] of Object.entries(shots)) {
    const [locale, scheme] = key.split("-");
    const c = THEME[scheme];
    await render(
      browser,
      `screenshot-${key}.jpg`,
      1280,
      800,
      `<div style="width:1280px;height:800px;box-sizing:border-box;background:${c.ground};color:${c.ink};
        font-family:${FONT};display:flex;align-items:center;gap:72px;padding:0 96px">
        <div style="flex:1;max-width:560px">
          <p style="margin:0 0 20px;font:600 14px/1 ${MONO};letter-spacing:.14em;text-transform:uppercase;
            color:${c.muted}">ymd Cookies</p>
          <h1 style="margin:0 0 20px;font-size:44px;line-height:1.15;font-weight:650">${COPY[locale].title}</h1>
          <p style="margin:0;font-size:20px;line-height:1.5;color:${c.muted}">${COPY[locale].body}</p>
        </div>
        ${img(png, 380, c)}
      </div>`,
    );
  }

  for (const [locale, png] of Object.entries(welcome)) {
    const c = THEME.light;
    await render(
      browser,
      `screenshot-welcome-${locale}.jpg`,
      1280,
      800,
      `<div style="width:1280px;height:800px;box-sizing:border-box;background:${c.ground};color:${c.ink};
        font-family:${FONT};display:flex;align-items:center;gap:72px;padding:0 96px;overflow:hidden">
        <div style="flex:1;max-width:520px">
          <p style="margin:0 0 20px;font:600 14px/1 ${MONO};letter-spacing:.14em;text-transform:uppercase;
            color:${c.muted}">ymd Cookies</p>
          <h1 style="margin:0 0 20px;font-size:44px;line-height:1.15;font-weight:650">${COPY[locale].welcomeTitle}</h1>
          <p style="margin:0;font-size:20px;line-height:1.5;color:${c.muted}">${COPY[locale].welcomeBody}</p>
        </div>
        <div style="height:800px;padding-top:48px;box-sizing:border-box">${img(png, 420, c)}</div>
      </div>`,
    );
  }

  const d = THEME.dark;
  await render(
    browser,
    "tile-small.jpg",
    440,
    280,
    `<div style="width:440px;height:280px;box-sizing:border-box;background:${d.ground};color:${d.ink};
      font-family:${FONT};display:flex;flex-direction:column;justify-content:center;gap:16px;padding:0 40px">
      <div style="display:flex;align-items:center;gap:14px">${mark(56)}
        <span style="font-size:30px;font-weight:650">ymd Cookies</span></div>
      <p style="margin:0;font-size:17px;line-height:1.4;color:${d.muted}">Tus sesiones, de tu navegador a ymd.
        Sin red.</p>
    </div>`,
  );
  await render(
    browser,
    "tile-marquee.jpg",
    1400,
    560,
    `<div style="width:1400px;height:560px;box-sizing:border-box;background:${d.ground};color:${d.ink};
      font-family:${FONT};display:flex;align-items:center;justify-content:space-between;padding:0 110px;
      overflow:hidden">
      <div style="max-width:640px">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:28px">${mark(64)}
          <span style="font-size:34px;font-weight:650">ymd Cookies</span></div>
        <h1 style="margin:0 0 16px;font-size:44px;line-height:1.15;font-weight:650">${COPY.es.title}</h1>
        <p style="margin:0;font-size:20px;line-height:1.5;color:${d.muted}">${COPY.es.body}</p>
      </div>
      <div style="height:560px;padding-top:56px;box-sizing:border-box">${img(shots["es-dark"], 360, d)}</div>
    </div>`,
  );
} finally {
  await browser.close();
}
