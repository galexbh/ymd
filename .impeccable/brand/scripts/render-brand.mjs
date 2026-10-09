// Rasterizes the ymd brand with Playwright (Chromium):
//   src-tauri/icons/app-icon.png (1024, transparent), NSIS header/sidebar BMPs (24-bit),
//   and .impeccable/brand/final-render.png (size check on light and dark grounds).
// Usage: node .impeccable/brand/scripts/render-brand.mjs <repoRoot>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const ROOT = process.argv[2] ?? process.cwd();
const require = createRequire(path.join(ROOT, "package.json"));
const { chromium } = require("@playwright/test");
const rd = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const strip = (s) => s.replace(/ width="\d+" height="\d+"/, "");
const BOARD = "#E9ECEA", SLATE = "#1E262B", INK = "#1E262B", ACCENT = "#6B3FA0";

const browser = await chromium.launch();

/* app icon */
{
  const p = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  await p.setContent(`<html><body style="margin:0;background:transparent">${rd(".impeccable/brand/appicon.svg")}</body></html>`);
  await p.locator("svg").screenshot({ path: path.join(ROOT, "src-tauri/icons/app-icon.png"), omitBackground: true });
  await p.close();
}

/* 24-bit BMP writer (bottom-up rows, 4-byte padded) */
function writeBmp(file, w, h, rgba) {
  const row = Math.ceil((w * 3) / 4) * 4, size = 54 + row * h, b = Buffer.alloc(size);
  b.write("BM", 0); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14); b.writeInt32LE(w, 18); b.writeInt32LE(h, 22);
  b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(row * h, 34);
  b.writeInt32LE(2835, 38); b.writeInt32LE(2835, 42);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((h - 1 - y) * w + x) * 4, d = 54 + y * row + x * 3;
    b[d] = rgba[s + 2]; b[d + 1] = rgba[s + 1]; b[d + 2] = rgba[s];
  }
  fs.writeFileSync(file, b);
}
async function bmp(rel, w, h, inner) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${BOARD}"/>${inner}</svg>`;
  const px = await p.evaluate(async ({ doc, w, h }) => {
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(doc);
    await img.decode();
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    return Array.from(g.getImageData(0, 0, w, h).data);
  }, { doc, w, h });
  writeBmp(path.join(ROOT, rel), w, h, px);
  await p.close();
}
const logo = strip(rd("src/assets/brand/logotype.svg"))
  .replace(/var\(--accent, (#[0-9A-Fa-f]{6})\)/, "$1").replace(/currentColor/g, INK);
const iso64 = strip(rd("src/assets/brand/isotype.svg")).replace(/currentColor/g, ACCENT);
const nest = (s, x, y, w, h) => s.replace("<svg ", `<svg x="${x}" y="${y}" width="${w}" height="${h}" `);
// header 150x57: lockup on the left, generous right side (NSIS paints text over the left part on some pages)
await bmp("src-tauri/icons/nsis-header.bmp", 150, 57, nest(logo, 12, 14, 80, 29) + `<rect x="0" y="56" width="150" height="1" fill="#8C9CA8"/>`);
// sidebar 164x314: stamp + wordmark at top, ledger rules below
await bmp("src-tauri/icons/nsis-sidebar.bmp", 164, 314,
  nest(logo, 22, 40, 120, 44) +
  [130, 154, 178, 202, 226, 250, 274].map((y) => `<rect x="22" y="${y}" width="120" height="1" fill="#8C9CA8"/>`).join("") +
  `<rect x="22" y="129" width="78" height="3" fill="${ACCENT}"/>`);

/* Windows icon: 16/24/32 use the pixel-hinted drawings on a paper tile; 48/256 use the app-icon tile.
   Runs after `tauri icon`, overwriting its icon.ico and 32x32.png. */
async function rasterSvg(doc, size) {
  const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await p.setContent(`<html><body style="margin:0;background:transparent">${doc}</body></html>`);
  const buf = await p.locator("svg").screenshot({ omitBackground: true });
  await p.close();
  return buf;
}
const PAPER = "#F2F3EF";
const small = (size) => {
  const src = size === 16 ? "isotype-16.svg" : size === 24 ? "isotype-24.svg" : "isotype.svg";
  const grid = size === 16 ? 16 : size === 24 ? 24 : 64;
  const inner = strip(rd(`src/assets/brand/${src}`)).replace(/^<svg[^>]*>|<\/svg>\s*$/g, "").replace(/currentColor/g, ACCENT);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${grid} ${grid}" shape-rendering="crispEdges">` +
    `<rect width="${grid}" height="${grid}" rx="${grid * 0.18}" fill="${PAPER}" shape-rendering="geometricPrecision"/>${inner}</svg>`;
};
const tileAt = (size) => rd(".impeccable/brand/appicon.svg").replace(/ width="\d+" height="\d+"/, ` width="${size}" height="${size}"`);
const icoSizes = [16, 24, 32, 48, 256];
const pngs = [];
for (const s of icoSizes) pngs.push(await rasterSvg(s <= 32 ? small(s) : tileAt(s), s));
fs.writeFileSync(path.join(ROOT, "src-tauri/icons/32x32.png"), pngs[2]);
{
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let off = head.length;
  pngs.forEach((png, i) => {
    const e = 6 + 16 * i, s = icoSizes[i] >= 256 ? 0 : icoSizes[i];
    head[e] = s; head[e + 1] = s; head[e + 2] = 0; head[e + 3] = 0;
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(off, e + 12);
    off += png.length;
  });
  fs.writeFileSync(path.join(ROOT, "src-tauri/icons/icon.ico"), Buffer.concat([head, ...pngs]));
}
/* assertion: the ico carries exactly 16, 24, 32, 48, 256, each a PNG of the declared size */
{
  const b = fs.readFileSync(path.join(ROOT, "src-tauri/icons/icon.ico"));
  if (b.readUInt16LE(2) !== 1) throw new Error("icon.ico: not an icon resource");
  const found = [];
  for (let i = 0; i < b.readUInt16LE(4); i++) {
    const e = 6 + 16 * i, w = b[e] || 256, h = b[e + 1] || 256, off = b.readUInt32LE(e + 12);
    if (b.readUInt32BE(off) !== 0x89504e47) throw new Error(`icon.ico: entry ${w} is not PNG`);
    const pw = b.readUInt32BE(off + 16), ph = b.readUInt32BE(off + 20);
    if (pw !== w || ph !== h || w !== h) throw new Error(`icon.ico: entry ${w}x${h} holds a ${pw}x${ph} image`);
    found.push(w);
  }
  if (found.join() !== icoSizes.join()) throw new Error(`icon.ico: sizes ${found} != ${icoSizes}`);
  const p32 = fs.readFileSync(path.join(ROOT, "src-tauri/icons/32x32.png"));
  if (p32.readUInt32BE(16) !== 32 || p32.readUInt32BE(20) !== 32) throw new Error("32x32.png is not 32x32");
  console.log("icon.ico ok:", found.join(", "));
}

/* size check render */
{
  const files = { 16: "isotype-16.svg", 24: "isotype-24.svg", 32: "isotype.svg", 48: "isotype.svg", 128: "isotype.svg" };
  const cell = (s) => `<figure><span style="width:${s}px;height:${s}px">${strip(rd(`src/assets/brand/${files[s]}`))}</span><figcaption>${s}</figcaption></figure>`;
  const ground = (bg, fg, ac) => `<div class="g" style="background:${bg};color:${fg};--accent:${ac}"><div class="row">${[16, 24, 32, 48, 128].map(cell).join("")}</div>` +
    `<div class="row">${[16, 24, 32, 48].map((s) => `<span style="color:${ac};width:${s}px;height:${s}px">${strip(rd(`src/assets/brand/${files[s]}`))}</span>`).join("")}</div>` +
    `<div class="lg">${strip(rd("src/assets/brand/logotype.svg"))}</div><div class="lg sm">${strip(rd("src/assets/brand/logotype.svg"))}</div></div>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;padding:24px;background:#D9DEDB;font:12px system-ui;display:grid;grid-template-columns:1fr 1fr 300px;gap:16px;width:1300px}
    .g{padding:20px;border-radius:6px;display:flex;flex-direction:column;gap:18px}.row{display:flex;gap:22px;align-items:flex-end}
    figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:6px}figcaption{opacity:.6;font-family:Consolas,monospace}
    span{display:block}span svg{width:100%;height:100%;display:block}.lg svg{height:64px;width:auto;display:block}.lg.sm svg{height:24px}
    .ic{display:grid;gap:10px}.ic div{border-radius:6px;padding:12px;display:flex;gap:12px;align-items:center;justify-content:center}
  </style></head><body>${ground(BOARD, INK, ACCENT)}${ground(SLATE, "#E2E6E4", "#B9A3E3")}
  <div class="ic"><div style="background:#F3F3F3"><img src="${pathToFileURL(path.join(ROOT, "src-tauri/icons/app-icon.png"))}" width="128"><img src="${pathToFileURL(path.join(ROOT, "src-tauri/icons/32x32.png"))}" width="32"><img src="${pathToFileURL(path.join(ROOT, "src-tauri/icons/nsis-header.bmp"))}"></div>
  <div style="background:#202020"><img src="${pathToFileURL(path.join(ROOT, "src-tauri/icons/app-icon.png"))}" width="128"><img src="${pathToFileURL(path.join(ROOT, "src-tauri/icons/32x32.png"))}" width="32"><img src="${pathToFileURL(path.join(ROOT, "src-tauri/icons/nsis-sidebar.bmp"))}" width="82"></div></div>
  </body></html>`;
  const tmp = path.join(ROOT, ".impeccable/brand/final-render.html");
  fs.writeFileSync(tmp, html);
  const p = await browser.newPage({ viewport: { width: 1348, height: 600 }, deviceScaleFactor: 1 });
  await p.goto(pathToFileURL(tmp).href);
  await p.screenshot({ path: path.join(ROOT, ".impeccable/brand/final-render.png"), fullPage: true });
  const z = await browser.newPage({ viewport: { width: 1348, height: 600 }, deviceScaleFactor: 4 });
  await z.goto(pathToFileURL(tmp).href);
  await z.screenshot({ path: path.join(ROOT, ".impeccable/brand/final-render-zoom.png"), clip: { x: 24, y: 24, width: 300, height: 150 } });
  fs.unlinkSync(tmp);
}
await browser.close();
console.log("rendered");
