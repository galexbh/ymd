import { describe, expect, it } from "vitest";
import { ALLOWLIST_VERSION, ensureAllowlist, KEYS, readAllowlist } from "../lib/storage";
import { createChromeFake } from "../test/chrome-fake";

describe("ensureAllowlist", () => {
  it("seeds only youtube.com on a fresh install", async () => {
    const fake = createChromeFake();
    await ensureAllowlist(fake.api);
    expect(fake.store.get(KEYS.allowlist)).toEqual(["youtube.com"]);
    expect(fake.store.get(KEYS.allowlistVersion)).toBe(ALLOWLIST_VERSION);
  });

  it("drops the retired google.com default once, keeping the person's sites", async () => {
    const fake = createChromeFake({
      storage: { [KEYS.allowlist]: ["youtube.com", "google.com", "vimeo.com"] },
    });
    await ensureAllowlist(fake.api);
    expect(await readAllowlist(fake.api)).toEqual(["youtube.com", "vimeo.com"]);
    expect(fake.store.get(KEYS.allowlistVersion)).toBe(ALLOWLIST_VERSION);
  });

  it("keeps google.com when the person adds it again after the migration", async () => {
    const fake = createChromeFake({
      storage: {
        [KEYS.allowlist]: ["youtube.com", "google.com"],
        [KEYS.allowlistVersion]: ALLOWLIST_VERSION,
      },
    });
    await ensureAllowlist(fake.api);
    expect(await readAllowlist(fake.api)).toEqual(["youtube.com", "google.com"]);
  });

  it("respects a list the person emptied", async () => {
    const fake = createChromeFake({ storage: { [KEYS.allowlist]: [] } });
    await ensureAllowlist(fake.api);
    expect(await readAllowlist(fake.api)).toEqual([]);
  });
});
