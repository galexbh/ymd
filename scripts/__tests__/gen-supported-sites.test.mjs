import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NETRC_KEY,
  SOURCE_URL,
  compareNames,
  parseSupportedSites,
  serialize,
} from "../gen-supported-sites.mjs";

// Lines copied verbatim from yt-dlp's supportedsites.md (zero-width spaces included).
// (vitest runs from the repo root; jsdom gives import.meta.url an http scheme)
const fixture = readFileSync(resolve("scripts/__fixtures__/supportedsites.md"), "utf8");
const sites = parseSupportedSites(fixture);
const byName = (name) => sites.find((s) => s.name === name);

describe("parseSupportedSites (real fixture)", () => {
  it("reads every entry and skips the prose header", () => {
    expect(sites).toHaveLength(16);
    expect(byName("Supported sites")).toBeUndefined();
  });

  it("a netrc site without description", () => {
    expect(byName("10play")).toEqual({ name: "10play", description: "", netrc: "10play" });
  });

  it("a netrc site with a description", () => {
    expect(byName("ADN")).toEqual({
      name: "ADN",
      description: "Animation Digital Network",
      netrc: "animationdigitalnetwork",
    });
  });

  it("a broken site, with and without description", () => {
    expect(byName("20min")).toEqual({ name: "20min", description: "", broken: true });
    expect(byName("BR")).toEqual({
      name: "BR",
      description: "Bayerischer Rundfunk",
      broken: true,
    });
  });

  it("netrc and broken together", () => {
    expect(byName("fancode:live")).toEqual({
      name: "fancode:live",
      description: "",
      netrc: "fancode",
      broken: true,
    });
  });

  it("a normal site and a non-Latin description", () => {
    expect(byName("9c9media")).toEqual({ name: "9c9media", description: "" });
    expect(byName("1tv")).toEqual({ name: "1tv", description: "Первый канал" });
  });

  it("names with ':' lose yt-dlp's zero-width break hint", () => {
    expect(byName("abc.net.au:iview:showseries")).toEqual({
      name: "abc.net.au:iview:showseries",
      description: "",
    });
    const music = byName("youtube:music:search_url");
    expect(music?.netrc).toBe("youtube");
    // the fixture really carries U+200B inside these names
    expect(fixture.includes("abc.net.au:​iview")).toBe(true);
    expect(sites.every((s) => !s.name.includes("​"))).toBe(true);
  });

  it("descriptions keep colons, quotes, semicolons and #", () => {
    expect(byName("web.archive:youtube")?.description).toBe(
      'web.archive.org saved youtube videos, "ytarchive:" prefix',
    );
    expect(byName("youtube:favorites")?.description).toBe(
      'YouTube liked videos; ":ytfav" keyword (requires cookies)',
    );
    expect(byName("youtube:music:search_url")?.description).toBe(
      "YouTube music search URLs with selectable sections, e.g. #songs",
    );
  });

  it("several extractors can share one netrc machine", () => {
    const vimeo = sites.filter((s) => s.netrc === "vimeo").map((s) => s.name);
    expect(vimeo).toEqual(["vhx:embed", "vimeo", "vimeo:likes"]);
  });

  it("is sorted case-insensitively", () => {
    const names = sites.map((s) => s.name);
    expect(names).toEqual([...names].sort(compareNames));
    expect(names.indexOf("ADN")).toBeLessThan(names.indexOf("BR"));
    expect(names.indexOf("abc.net.au:iview:showseries")).toBeLessThan(names.indexOf("ADN"));
  });
});

describe("parseSupportedSites (edge cases)", () => {
  it("dedupes by name and merges what later lines add", () => {
    const out = parseSupportedSites(
      [" - **foo**", ' - **foo**: [*foo*](## "netrc machine") Foo TV', " - **Bar**"].join("\n"),
    );
    expect(out).toEqual([
      { name: "Bar", description: "" },
      { name: "foo", description: "Foo TV", netrc: "foo" },
    ]);
  });

  it("drops netrc machines outside the keychain alphabet", () => {
    const out = parseSupportedSites(' - **x**: [*_bad key*](## "netrc machine")');
    expect(out).toEqual([{ name: "x", description: "" }]);
  });

  it("accepts CRLF line endings and collapses whitespace", () => {
    const out = parseSupportedSites(" - **a**:   one   two  \r\n - **b**\r\n");
    expect(out).toEqual([
      { name: "a", description: "one two" },
      { name: "b", description: "" },
    ]);
  });

  it("ignores lines that are not entries", () => {
    expect(parseSupportedSites("# Supported sites\n\nSome **bold** prose\n")).toEqual([]);
  });

  it("the netrc alphabet matches normalize_key", () => {
    for (const ok of ["vimeo", "bbc.co.uk", "a-b_c", "10play"])
      expect(NETRC_KEY.test(ok)).toBe(true);
    for (const bad of ["", "-x", "_x", "Vimeo", "a b", "a/b"])
      expect(NETRC_KEY.test(bad)).toBe(false);
  });
});

describe("serialize", () => {
  it("writes valid JSON with one site per line", () => {
    const text = serialize({ source: SOURCE_URL, fetchedAt: "2026-01-01", sites });
    const data = JSON.parse(text);
    expect(data).toEqual({ source: SOURCE_URL, fetchedAt: "2026-01-01", count: 16, sites });
    const siteLines = text.split("\n").filter((l) => l.startsWith('    {"name"'));
    expect(siteLines).toHaveLength(16);
    expect(text.endsWith("\n")).toBe(true);
  });
});
