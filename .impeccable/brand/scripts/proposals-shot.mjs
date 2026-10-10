// usage: node shot.mjs <repoDir>
import { createRequire } from "node:module";
import path from "node:path";
const repo = process.argv[2];
const require = createRequire(path.join(repo, "package.json"));
const { chromium } = require("@playwright/test");
const out = path.join(repo, ".impeccable", "review");
const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, colorScheme: theme });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://localhost:1420/?gallery=${theme}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, `gallery-${theme}.png`), fullPage: true });
  console.log(theme, "errors:", errors.join("\n") || "none");
  await page.close();
}
await browser.close();
