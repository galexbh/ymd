#!/usr/bin/env node
// Builds src/data/supported-sites.json from yt-dlp's official supportedsites.md.
//
//   node scripts/gen-supported-sites.mjs                 # download from GitHub
//   node scripts/gen-supported-sites.mjs --input file.md # offline / tests
//   node scripts/gen-supported-sites.mjs --output out.json
//
// supportedsites.md lists one extractor per line:
//   - **name**: [*netrc*](## "netrc machine") description (**Currently broken**)
// Every part after the bold name is optional. yt-dlp inserts a zero-width space after the first
// ":" of names with two or more colons (so they wrap); it is stripped here.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SOURCE_URL =
  "https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/supportedsites.md";

/** Same alphabet ymd's keychain accepts (`normalize_key` in src-tauri/src/auth/keychain.rs). */
export const NETRC_KEY = /^[a-z0-9.][a-z0-9._-]*$/;

const ENTRY = /^\s*[-*]\s+\*\*(.+?)\*\*(?::\s*(.*))?\s*$/;
const NETRC = /\[\*([^*\]]+)\*\]\(##\s*"netrc machine"\)/;
const BROKEN = /\(\*\*Currently broken\*\*\)/i;
// zero-width space/joiners, word joiner and BOM, spelled as escapes so the source stays visible
const INVISIBLE = new RegExp("[\\u200b-\\u200d\\u2060\\ufeff]", "g");

/**
 * Parse supportedsites.md into sorted, de-duplicated site records.
 * @param {string} md
 * @returns {{ name: string, description: string, netrc?: string, broken?: boolean }[]}
 */
export function parseSupportedSites(md) {
  const byName = new Map();
  for (const line of md.split(/\r?\n/)) {
    const m = ENTRY.exec(line);
    if (!m) continue;
    const name = m[1].replace(INVISIBLE, "").trim();
    if (!name) continue;
    let rest = (m[2] ?? "").replace(INVISIBLE, "");

    const site = { name, description: "" };
    const netrc = NETRC.exec(rest);
    if (netrc) {
      const key = netrc[1].trim().toLowerCase();
      if (NETRC_KEY.test(key)) site.netrc = key;
      rest = rest.replace(NETRC, " ");
    }
    if (BROKEN.test(rest)) {
      site.broken = true;
      rest = rest.replace(BROKEN, " ");
    }
    site.description = rest.replace(/\s+/g, " ").trim();

    // Later duplicates only add information; the first description wins.
    const prev = byName.get(name);
    if (prev) {
      if (!prev.description) prev.description = site.description;
      if (!prev.netrc && site.netrc) prev.netrc = site.netrc;
      if (site.broken) prev.broken = true;
    } else byName.set(name, site);
  }
  return [...byName.values()].sort((a, b) => compareNames(a.name, b.name));
}

/** Case-insensitive, then exact, so the order is stable across platforms and locales. */
export function compareNames(a, b) {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x !== y) return x < y ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * One site per line: small diffs in the weekly PR and a file that stays readable.
 * @param {{ source: string, fetchedAt: string, sites: ReturnType<typeof parseSupportedSites> }} data
 */
export function serialize({ source, fetchedAt, sites }) {
  const head = `{\n  "source": ${JSON.stringify(source)},\n  "fetchedAt": ${JSON.stringify(fetchedAt)},\n  "count": ${sites.length},\n  "sites": [\n`;
  const rows = sites.map((s) => `    ${JSON.stringify(s)}`).join(",\n");
  return `${head}${rows}\n  ]\n}\n`;
}

function arg(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main(argv) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const input = arg(argv, "--input");
  const output = resolve(arg(argv, "--output") ?? resolve(root, "src/data/supported-sites.json"));

  let md;
  if (input) md = await readFile(resolve(input), "utf8");
  else {
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`GET ${SOURCE_URL} → ${res.status}`);
    md = await res.text();
  }

  const sites = parseSupportedSites(md);
  // A format change upstream must fail loudly instead of committing an empty list.
  if (sites.length < 100) throw new Error(`only ${sites.length} sites parsed; format changed?`);

  // Keep fetchedAt when nothing else changed, so the weekly job opens no empty PR.
  let fetchedAt = new Date().toISOString().slice(0, 10);
  try {
    const prev = JSON.parse(await readFile(output, "utf8"));
    if (JSON.stringify(prev.sites) === JSON.stringify(sites)) fetchedAt = prev.fetchedAt;
  } catch {
    // first run
  }

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, serialize({ source: SOURCE_URL, fetchedAt, sites }));
  const netrc = sites.filter((s) => s.netrc).length;
  const broken = sites.filter((s) => s.broken).length;
  console.info(`${sites.length} sites (${netrc} with netrc, ${broken} broken) → ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
