import { describe, expect, it } from "vitest";
import {
  COOKIES_ONLY,
  SITE_KEY,
  SUPPORTED_SITES,
  accountSites,
  filterSites,
  normalizeSiteKey,
  type SupportedSite,
} from "../supportedSites";

const { sites } = SUPPORTED_SITES;

describe("committed supported-sites.json", () => {
  it("has the generator's shape", () => {
    expect(SUPPORTED_SITES.source).toBe(
      "https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/supportedsites.md",
    );
    expect(SUPPORTED_SITES.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const s of sites) {
      expect(
        Object.keys(s).every((k) => ["name", "description", "netrc", "broken"].includes(k)),
      ).toBe(true);
      expect(typeof s.name).toBe("string");
      expect(s.name.trim()).toBe(s.name);
      expect(s.name).not.toBe("");
      expect(typeof s.description).toBe("string");
      if ("broken" in s) expect(s.broken).toBe(true);
    }
  });

  it("count matches and the list is large enough to be real", () => {
    expect(SUPPORTED_SITES.count).toBe(sites.length);
    expect(sites.length).toBeGreaterThan(1000);
    expect(sites.filter((s) => s.netrc).length).toBeGreaterThan(50);
    expect(sites.some((s) => s.broken)).toBe(true);
  });

  it("names are unique and carry no invisible characters", () => {
    expect(new Set(sites.map((s) => s.name)).size).toBe(sites.length);
    const invisible = new RegExp("[\\u200b-\\u200d\\u2060\\ufeff]");
    expect(sites.filter((s) => invisible.test(s.name))).toEqual([]);
  });

  it("netrc keys match the keychain alphabet", () => {
    const bad = sites.filter((s) => s.netrc !== undefined && !SITE_KEY.test(s.netrc));
    expect(bad).toEqual([]);
  });

  it("is sorted case-insensitively", () => {
    const names = sites.map((s) => s.name.toLowerCase());
    for (let i = 1; i < names.length; i++)
      expect(names[i - 1] <= names[i], `${names[i - 1]} > ${names[i]}`).toBe(true);
  });

  it("knows the sites the UI promises", () => {
    expect(sites.find((s) => s.name === "vimeo")?.netrc).toBe("vimeo");
    expect(sites.find((s) => s.name === "youtube")?.netrc).toBe("youtube");
  });
});

describe("accountSites", () => {
  const fake: SupportedSite[] = [
    { name: "vhx:embed", description: "", netrc: "vimeo" },
    { name: "vimeo:likes", description: "Vimeo user likes", netrc: "vimeo" },
    { name: "vimeo", description: "", netrc: "vimeo" },
    { name: "Nebula", description: "Nebula videos", netrc: "watchnebula", broken: true },
    { name: "plain", description: "" },
  ];

  it("groups extractors by netrc key and names the group after its main extractor", () => {
    expect(accountSites(fake)).toEqual([
      {
        key: "watchnebula",
        name: "Nebula",
        description: "Nebula videos",
        extractors: ["Nebula"],
        broken: true,
      },
      {
        key: "vimeo",
        name: "vimeo",
        description: "",
        extractors: ["vhx:embed", "vimeo:likes", "vimeo"],
        broken: false,
      },
    ]);
  });

  it("covers every netrc key of the real list once", () => {
    const keys = accountSites().map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(["vimeo", "youtube"]));
    expect(COOKIES_ONLY.has("youtube")).toBe(true);
  });
});

describe("normalizeSiteKey", () => {
  it("lowercases and trims like normalize_key, rejecting the rest", () => {
    expect(normalizeSiteKey("  Vimeo ")).toBe("vimeo");
    expect(normalizeSiteKey("bbc.co.uk")).toBe("bbc.co.uk");
    expect(normalizeSiteKey("caracoltv-play")).toBe("caracoltv-play");
    for (const bad of ["", "   ", "-x", "_x", "a b", "a/b", "ñu"])
      expect(normalizeSiteKey(bad)).toBeNull();
  });
});

describe("filterSites", () => {
  const list: SupportedSite[] = [
    { name: "vhx:embed", description: "", netrc: "vimeo" },
    { name: "Arte", description: "Kultur", broken: true },
    { name: "vimeo", description: "", netrc: "vimeo" },
    { name: "Café", description: "" },
  ];

  it("ranks name prefixes before other matches and folds accents", () => {
    expect(filterSites(list, "vimeo", "all").map((s) => s.name)).toEqual(["vimeo", "vhx:embed"]);
    expect(filterSites(list, "cafe", "all").map((s) => s.name)).toEqual(["Café"]);
    expect(filterSites(list, "kultur", "all").map((s) => s.name)).toEqual(["Arte"]);
  });

  it("filters by account and broken", () => {
    expect(filterSites(list, "", "account").map((s) => s.name)).toEqual(["vhx:embed", "vimeo"]);
    expect(filterSites(list, "", "broken").map((s) => s.name)).toEqual(["Arte"]);
    expect(filterSites(list, "", "all")).toHaveLength(4);
  });
});
