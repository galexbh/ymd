import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EXTENSION_DIR } from "../test/chrome-fake";

const manifest = JSON.parse(readFileSync(resolve(EXTENSION_DIR, "manifest.json"), "utf8")) as {
  key: string;
  [k: string]: unknown;
};
const doc = readFileSync(resolve(EXTENSION_DIR, "../docs/cookie-bridge.md"), "utf8");

/** Chrome's extension ID: sha256 of the SPKI DER, first 16 bytes, each nibble mapped 0-f → a-p. */
function extensionId(base64Key: string): string {
  const digest = createHash("sha256").update(Buffer.from(base64Key, "base64")).digest();
  return [...digest.subarray(0, 16).toString("hex")]
    .map((h) => String.fromCharCode("a".charCodeAt(0) + parseInt(h, 16)))
    .join("");
}

describe("manifest", () => {
  const docId = /Extension ID.*?`([a-p]{32})`/.exec(doc)?.[1];
  const docKey = /```\s*\n(MII[A-Za-z0-9+/=]+)\s*\n```/.exec(doc)?.[1];

  it("its key derives to the fixed ID in docs/cookie-bridge.md", () => {
    expect(docId).toBe("gicaphbpepkphmeciigjhdpnbcaflfgd");
    expect(extensionId(manifest.key)).toBe(docId);
  });

  it("uses exactly the key published in the contract", () => {
    expect(manifest.key).toBe(docKey);
  });

  it("asks for the documented permissions and nothing more", () => {
    expect(manifest).toMatchObject({
      manifest_version: 3,
      name: "ymd Cookies",
      version: "1.0.0",
      default_locale: "es",
      permissions: ["cookies", "nativeMessaging", "storage", "alarms"],
      host_permissions: ["*://*.youtube.com/*", "*://*.google.com/*"],
      optional_host_permissions: ["*://*/*"],
      background: { service_worker: "background.js", type: "module" },
      action: { default_popup: "popup.html" },
    });
  });
});
