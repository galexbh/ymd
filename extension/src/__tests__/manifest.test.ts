import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EXTENSION_DIR } from "../test/chrome-fake";

const manifest = JSON.parse(readFileSync(resolve(EXTENSION_DIR, "manifest.json"), "utf8")) as {
  key: string;
  [k: string]: unknown;
};
// The bridge contract is published on the docs site, in Spanish (root) and English (en/).
const DOCS_DIR = resolve(EXTENSION_DIR, "../website/src/content/docs");
const CONTRACT_PAGES = {
  es: resolve(DOCS_DIR, "desarrollo/puente-de-cookies.md"),
  en: resolve(DOCS_DIR, "en/desarrollo/puente-de-cookies.md"),
};

/** Chrome's extension ID: sha256 of the SPKI DER, first 16 bytes, each nibble mapped 0-f → a-p. */
function extensionId(base64Key: string): string {
  const digest = createHash("sha256").update(Buffer.from(base64Key, "base64")).digest();
  return [...digest.subarray(0, 16).toString("hex")]
    .map((h) => String.fromCharCode("a".charCodeAt(0) + parseInt(h, 16)))
    .join("");
}

describe("manifest", () => {
  describe.each(Object.entries(CONTRACT_PAGES))("bridge contract page (%s)", (_lang, page) => {
    const doc = readFileSync(page, "utf8");
    const docId = /(?:Extension ID|ID de la extensión).*?`([a-p]{32})`/.exec(doc)?.[1];
    const docKey = /```\s*\n(MII[A-Za-z0-9+/=]+)\s*\n```/.exec(doc)?.[1];

    it("its key derives to the fixed ID in the contract", () => {
      expect(docId).toBe("gicaphbpepkphmeciigjhdpnbcaflfgd");
      expect(extensionId(manifest.key)).toBe(docId);
    });

    it("uses exactly the key published in the contract", () => {
      expect(manifest.key).toBe(docKey);
    });
  });

  it("asks for the documented permissions and nothing more", () => {
    expect(manifest).toMatchObject({
      manifest_version: 3,
      name: "ymd Cookies",
      version: "1.3.0",
      default_locale: "es",
      permissions: ["cookies", "nativeMessaging", "storage", "alarms", "contextMenus", "activeTab"],
      host_permissions: ["*://*.youtube.com/*"],
      optional_host_permissions: ["*://*/*"],
      background: { service_worker: "background.js", type: "module" },
      action: { default_popup: "popup.html" },
    });
  });

  it("lets no other extension or web page connect to it", () => {
    expect(manifest.externally_connectable).toEqual({ ids: [] });
    expect(manifest).not.toHaveProperty("web_accessible_resources");
    expect(manifest).not.toHaveProperty("content_scripts");
  });

  it("locks its pages down to its own files", () => {
    const csp = (manifest.content_security_policy as { extension_pages: string }).extension_pages;
    const directives = Object.fromEntries(
      csp.split(";").map((d) => {
        const [name, ...values] = d.trim().split(/\s+/);
        return [name, values.join(" ")];
      }),
    );
    expect(directives).toMatchObject({
      "default-src": "'none'",
      "script-src": "'self'",
      "connect-src": "'none'",
      "object-src": "'none'",
      "base-uri": "'none'",
      "frame-ancestors": "'none'",
    });
    expect(csp).not.toMatch(/unsafe|https?:|\*/);
  });
});
