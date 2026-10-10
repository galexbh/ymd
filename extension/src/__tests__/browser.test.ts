import { describe, expect, it } from "vitest";
import { detectBrowser } from "../lib/browser";

const brands = (...names: string[]) => ({
  userAgentData: { brands: [{ brand: "Not)A;Brand" }, ...names.map((brand) => ({ brand }))] },
});

describe("detectBrowser", () => {
  it("asks navigator.brave first", async () => {
    expect(
      await detectBrowser({ brave: { isBrave: async () => true }, ...brands("Chromium") }),
    ).toBe("brave");
  });

  it("falls back to the brands when isBrave throws or says no", async () => {
    const nav = {
      brave: {
        isBrave: () => {
          throw new Error("nope");
        },
      },
      ...brands("Chromium", "Google Chrome"),
    };
    expect(await detectBrowser(nav)).toBe("chrome");
  });

  it.each([
    [["Chromium", "Microsoft Edge"], "edge"],
    [["Chromium", "Google Chrome"], "chrome"],
    [["Chromium"], "chromium"],
    [["Chromium", "Vivaldi"], "vivaldi"],
    [["Chromium", "Opera"], "opera"],
    [["Chromium", "Opera GX"], "opera"],
  ])("%j → %s", async (names, expected) => {
    expect(await detectBrowser(brands(...names))).toBe(expected);
  });

  it("is 'other' without userAgentData", async () => {
    expect(await detectBrowser({})).toBe("other");
    expect(await detectBrowser(undefined)).toBe("other");
  });
});
