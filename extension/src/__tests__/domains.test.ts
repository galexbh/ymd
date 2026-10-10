import { describe, expect, it } from "vitest";
import {
  cookieDomainAllowed,
  DEFAULT_DOMAINS,
  isDefaultDomain,
  normalizeDomain,
  originPattern,
  sanitizeAllowlist,
  RETIRED_DEFAULTS,
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
  it("the only default is youtube.com (google.com is retired)", () => {
    expect(DEFAULT_DOMAINS).toEqual(["youtube.com"]);
    expect(isDefaultDomain("youtube.com")).toBe(true);
    expect(isDefaultDomain("google.com")).toBe(false);
    expect(RETIRED_DEFAULTS).toEqual(["google.com"]);
    expect(isDefaultDomain("vimeo.com")).toBe(false);
  });

  it("builds the host match pattern", () => {
    expect(originPattern("vimeo.com")).toBe("*://*.vimeo.com/*");
  });

  it("sanitizes a stored list", () => {
    expect(sanitizeAllowlist(["YouTube.com", "bad", 3, "youtube.com", "vimeo.com"])).toEqual([
      "youtube.com",
      "vimeo.com",
    ]);
    expect(sanitizeAllowlist(undefined)).toEqual(["youtube.com"]);
    expect(sanitizeAllowlist([])).toEqual([]);
  });
});
