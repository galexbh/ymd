import { describe, expect, it } from "vitest";
import { addSite, removeSite } from "../lib/sites";
import { KEYS } from "../lib/storage";
import { createChromeFake } from "../test/chrome-fake";

const DEFAULTS = ["youtube.com", "google.com"];

describe("adding a site (optional host permission)", () => {
  it("requests *://*.<domain>/* and stores the normalized domain when granted", async () => {
    const fake = createChromeFake({ grant: true });
    const res = await addSite(fake.api, DEFAULTS, "https://www.Vimeo.com/123");
    expect(res).toEqual({ ok: true, domain: "vimeo.com", list: [...DEFAULTS, "vimeo.com"] });
    expect(fake.record.permissionRequests).toEqual([["*://*.vimeo.com/*"]]);
    expect(fake.store.get(KEYS.allowlist)).toEqual([...DEFAULTS, "vimeo.com"]);
    expect(fake.granted.has("*://*.vimeo.com/*")).toBe(true);
  });

  it("leaves the list alone when the user denies the prompt", async () => {
    const fake = createChromeFake({ grant: false });
    const res = await addSite(fake.api, DEFAULTS, "vimeo.com");
    expect(res).toEqual({ ok: false, reason: "denied", domain: "vimeo.com" });
    expect(fake.store.has(KEYS.allowlist)).toBe(false);
  });

  it("validates before asking for anything", async () => {
    const fake = createChromeFake();
    expect(await addSite(fake.api, DEFAULTS, "not a domain")).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(await addSite(fake.api, DEFAULTS, "YOUTUBE.com")).toEqual({
      ok: false,
      reason: "duplicate",
      domain: "youtube.com",
    });
    expect(fake.record.permissionRequests).toEqual([]);
  });

  it("re-adding a default needs no prompt", async () => {
    const fake = createChromeFake({ grant: false });
    const res = await addSite(fake.api, ["youtube.com"], "google.com");
    expect(res).toMatchObject({ ok: true, list: ["youtube.com", "google.com"] });
    expect(fake.record.permissionRequests).toEqual([]);
  });

  it("treats a throwing prompt as denied", async () => {
    const fake = createChromeFake();
    fake.api.permissions.request = async () => {
      throw new Error("This function must be called during a user gesture");
    };
    expect(await addSite(fake.api, DEFAULTS, "vimeo.com")).toMatchObject({ reason: "denied" });
  });
});

describe("removing a site", () => {
  it("revokes the optional permission of a non-default site", async () => {
    const fake = createChromeFake();
    await addSite(fake.api, DEFAULTS, "vimeo.com");
    const list = await removeSite(fake.api, [...DEFAULTS, "vimeo.com"], "vimeo.com");
    expect(list).toEqual(DEFAULTS);
    expect(fake.record.permissionRemovals).toEqual([["*://*.vimeo.com/*"]]);
    expect(fake.granted.has("*://*.vimeo.com/*")).toBe(false);
    expect(fake.store.get(KEYS.allowlist)).toEqual(DEFAULTS);
  });

  it("keeps the permission of a default site", async () => {
    const fake = createChromeFake();
    const list = await removeSite(fake.api, DEFAULTS, "google.com");
    expect(list).toEqual(["youtube.com"]);
    expect(fake.record.permissionRemovals).toEqual([]);
    expect(fake.granted.has("*://*.google.com/*")).toBe(true);
  });

  it("still removes the site when revoking fails", async () => {
    const fake = createChromeFake();
    fake.api.permissions.remove = async () => {
      throw new Error("You cannot remove required permissions.");
    };
    expect(
      await removeSite(fake.api, [...DEFAULTS, "music.youtube.com"], "music.youtube.com"),
    ).toEqual(DEFAULTS);
  });
});
