import { describe, expect, it } from "vitest";
import { collectCookies, domainsOf, hashCookies, toWire } from "../lib/cookies";
import { cookie, createChromeFake } from "../test/chrome-fake";

describe("collectCookies", () => {
  it("merges getAll per domain and de-duplicates overlapping results", async () => {
    const fake = createChromeFake({
      cookies: [
        cookie({ name: "SID", domain: ".google.com" }),
        cookie({ name: "LSID", domain: "accounts.google.com", hostOnly: true }),
        cookie({ name: "PREF", domain: ".youtube.com" }),
        cookie({ name: "other", domain: ".vimeo.com" }),
      ],
    });
    // "accounts.google.com" overlaps "google.com": both getAll calls return LSID.
    const got = await collectCookies(fake.api, [
      "google.com",
      "accounts.google.com",
      "youtube.com",
    ]);
    expect(fake.record.getAll).toEqual([
      { domain: "google.com" },
      { domain: "accounts.google.com" },
      { domain: "youtube.com" },
    ]);
    expect(got.map((c) => `${c.domain}|${c.name}`)).toEqual([
      ".google.com|SID",
      ".youtube.com|PREF",
      "accounts.google.com|LSID",
    ]);
  });

  it("keeps cookies that differ only by path", async () => {
    const fake = createChromeFake({
      cookies: [
        cookie({ name: "a", path: "/" }),
        cookie({ name: "a", path: "/tv" }),
        cookie({ name: "a", domain: "www.youtube.com", hostOnly: true }),
      ],
    });
    expect(await collectCookies(fake.api, ["youtube.com"])).toHaveLength(3);
  });

  it("returns nothing for an empty allowlist", async () => {
    const fake = createChromeFake({ cookies: [cookie({ name: "a" })] });
    expect(await collectCookies(fake.api, [])).toEqual([]);
  });

  it("gets nothing from a site whose host permission was not granted", async () => {
    const fake = createChromeFake({ cookies: [cookie({ name: "v", domain: ".vimeo.com" })] });
    expect(await collectCookies(fake.api, ["vimeo.com"])).toEqual([]);
    fake.granted.add("*://*.vimeo.com/*");
    expect(await collectCookies(fake.api, ["vimeo.com"])).toHaveLength(1);
  });
});

describe("toWire", () => {
  it("mirrors chrome.cookies.Cookie with exactly the contract fields", () => {
    const wire = toWire(cookie({ name: "SID", value: "s3cret" }));
    expect(Object.keys(wire).sort()).toEqual(
      [
        "domain",
        "expirationDate",
        "hostOnly",
        "httpOnly",
        "name",
        "path",
        "secure",
        "session",
        "value",
      ].sort(),
    );
    expect(wire.value).toBe("s3cret");
  });

  it("drops expirationDate on session cookies", () => {
    const wire = toWire(cookie({ name: "YSC", session: true, expirationDate: undefined }));
    expect("expirationDate" in wire).toBe(false);
  });
});

describe("hashCookies", () => {
  const base = [toWire(cookie({ name: "a" })), toWire(cookie({ name: "b" }))];

  it("is a stable sha256 hex regardless of order", async () => {
    const h = await hashCookies(base);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashCookies([...base].reverse())).toBe(h);
  });

  it("changes with value, expiry, path, domain or name", async () => {
    const h = await hashCookies(base);
    const variants = [
      { value: "x" },
      { expirationDate: 1 },
      { path: "/p" },
      { domain: ".m.youtube.com" },
      { name: "c" },
    ];
    for (const v of variants) {
      expect(await hashCookies([{ ...base[0], ...v }, base[1]])).not.toBe(h);
    }
  });

  it("ignores flags outside the fingerprint", async () => {
    expect(await hashCookies([{ ...base[0], httpOnly: !base[0].httpOnly }, base[1]])).toBe(
      await hashCookies(base),
    );
  });
});

describe("domainsOf", () => {
  it("lists the allowed domains that contributed cookies", () => {
    const list = [toWire(cookie({ name: "a", domain: "accounts.google.com" }))];
    expect(domainsOf(list, ["youtube.com", "google.com"])).toEqual(["google.com"]);
  });
});
