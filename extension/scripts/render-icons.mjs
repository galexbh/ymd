// Renders the extension icons (16/32/48/128 PNG) from the brand isotype drawings.
// The mark sits in Brand Violet on a pale paper tile, like the app icon, so it reads on light
// and dark toolbars alike. Each size uses the drawing hinted for it: the 16 and 24 grids for
// 16 and 32, the 64 master (on its 2px grid) for 48 and 128.
//
//   node extension/scripts/render-icons.mjs     (needs `pnpm e2e:install` once)
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const brand = resolve(here, "../../src/assets/brand");
const out = resolve(here, "../icons");

const BRAND_VIOLET = "#6B3FA0";
const PAPER = "#F2F3EF";
const PAPER_RULE = "#C3CAC6";

/** The <g> of a brand drawing, recoloured from currentColor to Brand Violet. */
function markOf(file) {
  const svg = readFileSync(resolve(brand, file), "utf8");
  const g = svg.match(/<g[\s\S]*<\/g>/)?.[0];
  if (!g) throw new Error(`no <g> in ${file}`);
  return g.replace('fill="currentColor"', `fill="${BRAND_VIOLET}"`);
}

// size, drawing, drawing grid, mark box size, tile inset, tile radius, tile rule
const SIZES = [
  [16, "isotype-16.svg", 16, 16, 0, 3, false],
  [32, "isotype-24.svg", 24, 24, 0, 6, false],
  [48, "isotype.svg", 64, 32, 0, 9, true],
  [128, "isotype.svg", 64, 80, 8, 22, true],
];

function iconSvg([size, file, grid, box, inset, radius, rule]) {
  const tile = size - inset * 2;
  const offset = (size - box) / 2;
  const scale = box / grid;
  const crisp = size <= 32 ? ' shape-rendering="crispEdges"' : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"${crisp}>
  <rect x="${inset}" y="${inset}" width="${tile}" height="${tile}" rx="${radius}" fill="${PAPER}"/>
  ${rule ? `<rect x="${inset + 0.5}" y="${inset + 0.5}" width="${tile - 1}" height="${tile - 1}" rx="${radius - 0.5}" fill="none" stroke="${PAPER_RULE}"/>` : ""}
  <g transform="translate(${offset} ${offset}) scale(${scale})">${markOf(file)}</g>
</svg>`;
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const spec of SIZES) {
    const size = spec[0];
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${iconSvg(spec)}`,
    );
    await page.locator("svg").screenshot({
      path: resolve(out, `icon-${size}.png`),
      omitBackground: true,
    });
    console.info(`icons/icon-${size}.png`);
  }
} finally {
  await browser.close();
}
