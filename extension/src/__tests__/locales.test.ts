import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EXTENSION_DIR, formatMessage, loadMessages } from "../test/chrome-fake";

const es = loadMessages("es");
const en = loadMessages("en");

function placeholderNames(entry: { placeholders?: Record<string, unknown> }): string[] {
  return Object.keys(entry.placeholders ?? {}).sort();
}

/** Every key the code and markup ask chrome.i18n for. */
function usedKeys(): Set<string> {
  const keys = new Set<string>();
  const html = readFileSync(resolve(EXTENSION_DIR, "popup.html"), "utf8");
  for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) keys.add(m[1]);
  const manifest = readFileSync(resolve(EXTENSION_DIR, "manifest.json"), "utf8");
  for (const m of manifest.matchAll(/__MSG_([A-Za-z0-9_@]+)__/g)) keys.add(m[1]);
  const lib = resolve(EXTENSION_DIR, "src/lib");
  for (const file of readdirSync(lib)) {
    const src = readFileSync(resolve(lib, file), "utf8");
    for (const m of src.matchAll(/\bt\(\s*"([A-Za-z0-9_]+)"/g)) keys.add(m[1]);
  }
  // The popup's key tables (stamp words, error texts and hints).
  const view = readFileSync(resolve(lib, "popup-view.ts"), "utf8");
  for (const m of view.matchAll(/"((?:stamp|error|add|site|last)[A-Z][A-Za-z]*)"/g)) keys.add(m[1]);
  return keys;
}

describe("locales", () => {
  it("es and en have exactly the same keys", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });

  it("each message has the same placeholders in both languages", () => {
    for (const key of Object.keys(es)) {
      expect(placeholderNames(en[key]), key).toEqual(placeholderNames(es[key]));
    }
  });

  it("no message is empty", () => {
    for (const [key, entry] of [...Object.entries(es), ...Object.entries(en)]) {
      expect(entry.message.trim(), key).not.toBe("");
    }
  });

  it("every key used by the popup and manifest exists", () => {
    const used = usedKeys();
    expect(used.size).toBeGreaterThan(20);
    for (const key of used) expect(es[key], key).toBeDefined();
  });

  it("fills placeholders like chrome.i18n", () => {
    expect(formatMessage(es.siteRemove, ["vimeo.com"])).toBe("Quitar vimeo.com");
    expect(formatMessage(en.errorRejected, ["io_error"])).toBe(
      "ymd could not save the cookies (io_error).",
    );
  });

  it("carries the privacy note verbatim", () => {
    expect(es.privacyNote.message).toBe(
      "Las cookies solo viajan a ymd en este equipo, sin red. Solo de los sitios de la lista.",
    );
  });
});
