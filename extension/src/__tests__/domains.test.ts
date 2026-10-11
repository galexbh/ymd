import { describe, expect, it } from "vitest";
import {
  cookieDomainAllowed,
  isPublicSuffix,
  normalizeDomain,
  originPattern,
  presetDomains,
  sanitizeAllowlist,
} from "../lib/domains";

describe("normalizeDomain", () => {
  it.each([
    ["vimeo.com", "vimeo.com"],
    ["  Vimeo.COM ", "vimeo.com"],
    ["https://www.vimeo.com/watch?v=1", "vimeo.com"],
    [".twitch.tv", "twitch.tv"],
    ["music.youtube.com", "music.youtube.com"],
    ["user@example.org:8080/x", "example.org"],
    ["xn--bcher-kva.example", "xn--bcher-kva.example"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  it.each(["", "localhost", "no spaces.com", "-bad.com", "bad-.com", "a..b", "1.2.3.4", "x.c0m"])(
    "rejects %j",
    (input) => {
      expect(normalizeDomain(input)).toBeNull();
    },
  );
});

describe("cookieDomainAllowed (the domain filter)", () => {
  const list = ["youtube.com", "google.com"];

  it("accepts the domain itself, with or without the leading dot", () => {
    expect(cookieDomainAllowed(".youtube.com", list)).toBe(true);
    expect(cookieDomainAllowed("youtube.com", list)).toBe(true);
  });

  it("accepts subdomains", () => {
    expect(cookieDomainAllowed("accounts.google.com", list)).toBe(true);
    expect(cookieDomainAllowed(".m.youtube.com", list)).toBe(true);
  });

  it("rejects look-alikes and other sites", () => {
    expect(cookieDomainAllowed("notyoutube.com", list)).toBe(false);
    expect(cookieDomainAllowed("youtube.com.evil.net", list)).toBe(false);
    expect(cookieDomainAllowed(".google.co.uk", list)).toBe(false);
    expect(cookieDomainAllowed("vimeo.com", list)).toBe(false);
  });

  it("allows nothing with an empty list", () => {
    expect(cookieDomainAllowed(".youtube.com", [])).toBe(false);
  });
});

describe("allowlist helpers", () => {
  it("builds the host match pattern", () => {
    expect(originPattern("vimeo.com")).toBe("*://*.vimeo.com/*");
  });

  it("takes the preset sites from the required host permissions", () => {
    expect(presetDomains(["*://*.youtube.com/*"])).toEqual(["youtube.com"]);
    expect(presetDomains(undefined)).toEqual([]);
    expect(presetDomains([])).toEqual([]);
    // broader or odd patterns never become a site
    expect(
      presetDomains(["*://*/*", "<all_urls>", "https://vimeo.com/*", "*://*.co.uk/*"]),
    ).toEqual([]);
  });

  it("sanitizes a stored list", () => {
    expect(sanitizeAllowlist(["YouTube.com", "bad", 3, "youtube.com", "vimeo.com"])).toEqual([
      "youtube.com",
      "vimeo.com",
    ]);
    expect(sanitizeAllowlist(undefined)).toEqual([]);
    expect(sanitizeAllowlist([])).toEqual([]);
  });
});

describe("public suffixes", () => {
  it("refuses shared hosts and country-code second levels, not real sites", () => {
    for (const d of [
      "github.io",
      "blogspot.com",
      "co.uk",
      "com.br",
      "ne.jp",
      "gob.mx",
      "pages.dev",
    ]) {
      expect(isPublicSuffix(d), d).toBe(true);
    }
    for (const d of [
      "youtube.com",
      "vimeo.com",
      "bbc.co.uk",
      "user.github.io",
      "co.com",
      "com.mx.example",
    ]) {
      expect(isPublicSuffix(d), d).toBe(false);
    }
  });

  it("drops them from a stored list", () => {
    expect(sanitizeAllowlist(["youtube.com", "github.io", "co.uk", "vimeo.com"])).toEqual([
      "youtube.com",
      "vimeo.com",
    ]);
  });
});
