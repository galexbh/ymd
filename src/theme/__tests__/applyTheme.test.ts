import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme, clampFontScale, DEFAULT_THEME, readThemeCache, resolveMode, THEME_CACHE_KEY } from "../applyTheme";
import { deriveAccent } from "../accent";

describe("applyTheme", () => {
  const root = document.documentElement;
  beforeEach(() => {
    localStorage.clear();
    root.removeAttribute("style");
  });

  it("resolves system mode from the OS preference", () => {
    expect(resolveMode("system", true)).toBe("dark");
    expect(resolveMode("system", false)).toBe("light");
    expect(resolveMode("light", true)).toBe("light");
  });

  it("sets data attributes and the font scale", () => {
    const r = applyTheme({ ...DEFAULT_THEME, mode: "dark", density: "compact", radius: "sharp", fontScale: 1.125 }, root, false);
    expect(r.resolved).toBe("dark");
    expect(root.dataset.theme).toBe("dark");
    expect(root.dataset.density).toBe("compact");
    expect(root.dataset.radius).toBe("sharp");
    expect(root.style.getPropertyValue("--font-scale")).toBe("1.125");
  });

  it("applies and caches a custom accent per theme", () => {
    const r = applyTheme({ ...DEFAULT_THEME, mode: "light", accent: "#f5e663" }, root, false);
    expect(r.adjusted).toBe(true);
    expect(root.style.getPropertyValue("--accent")).toBe(deriveAccent("#f5e663", "light").accent);
    const cache = readThemeCache();
    expect(cache?.settings.accent).toBe("#f5e663");
    expect(cache?.vars?.dark["--accent"]).toBe(deriveAccent("#f5e663", "dark").accent);
  });

  it("removes inline accent vars when going back to the default", () => {
    applyTheme({ ...DEFAULT_THEME, mode: "light", accent: "#0f6b6b" }, root, false);
    applyTheme({ ...DEFAULT_THEME, mode: "light", accent: null }, root, false);
    expect(root.style.getPropertyValue("--accent")).toBe("");
    expect(JSON.parse(localStorage.getItem(THEME_CACHE_KEY)!).vars).toBeNull();
  });

  it("clamps the font scale", () => {
    expect(clampFontScale(3)).toBe(1.25);
    expect(clampFontScale(0.2)).toBe(0.875);
    expect(clampFontScale(Number.NaN)).toBe(1);
  });
});
