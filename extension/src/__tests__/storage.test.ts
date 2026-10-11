import { describe, expect, it } from "vitest";
import { ensureAllowlist, KEYS, readAllowlist } from "../lib/storage";
import { createChromeFake, SHIPPED_HOSTS } from "../test/chrome-fake";

describe("ensureAllowlist", () => {
  it("the build ymd ships starts with YouTube, already granted", async () => {
    const fake = createChromeFake({ hostPermissions: SHIPPED_HOSTS });
    await ensureAllowlist(fake.api);
    expect(fake.store.get(KEYS.allowlist)).toEqual(["youtube.com"]);
    expect(await fake.api.permissions.contains({ origins: SHIPPED_HOSTS })).toBe(true);
  });

  it("the store build starts with an empty list", async () => {
    const fake = createChromeFake();
    await ensureAllowlist(fake.api);
    expect(fake.store.get(KEYS.allowlist)).toEqual([]);
  });

  it("leaves an existing list as the person left it", async () => {
    const fake = createChromeFake({
      hostPermissions: SHIPPED_HOSTS,
      storage: { [KEYS.allowlist]: ["google.com", "vimeo.com"] },
    });
    await ensureAllowlist(fake.api);
    expect(await readAllowlist(fake.api)).toEqual(["google.com", "vimeo.com"]);
  });

  it("respects a list the person emptied", async () => {
    const fake = createChromeFake({ storage: { [KEYS.allowlist]: [] } });
    await ensureAllowlist(fake.api);
    expect(await readAllowlist(fake.api)).toEqual([]);
  });
});
