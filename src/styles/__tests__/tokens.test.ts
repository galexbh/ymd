import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const tokensCss = read("../tokens.css");
import { AA_TEXT, DEFAULT_ACCENT, THEME_SURFACES, accentCssVars, contrastRatio, deriveAccent, type ResolvedTheme } from "../../theme/accent";

function block(theme: ResolvedTheme): Record<string, string> {
  const m = new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`).exec(tokensCss);
  if (!m) throw new Error(`no ${theme} block`);
  const out: Record<string, string> = {};
  for (const d of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  return out;
}

const light = block("light");
const dark = block("dark");
const themes = { light, dark };

describe("tokens.css", () => {
  it("defines the same tokens in light and dark", () => {
    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort());
    expect(Object.keys(light).length).toBeGreaterThan(20);
  });

  it("defines the required semantic tokens", () => {
    for (const k of ["--surface", "--surface-2", "--surface-sunken", "--text", "--text-muted", "--rule", "--rule-strong", "--accent", "--accent-hover", "--accent-active", "--accent-soft", "--on-accent", "--focus", "--danger", "--danger-soft", "--warning"]) {
      expect(light, k).toHaveProperty([k]);
    }
  });

  it("mirrors the surfaces declared in accent.ts", () => {
    for (const t of ["light", "dark"] as const) {
      const s = THEME_SURFACES[t];
      expect(themes[t]["--surface"]).toBe(s.surface);
      expect(themes[t]["--surface-2"]).toBe(s.surface2);
      expect(themes[t]["--surface-sunken"]).toBe(s.sunken);
      expect(themes[t]["--surface-raised"]).toBe(s.raised);
      expect(themes[t]["--text"]).toBe(s.text);
    }
  });

  it("ships the derived default accent", () => {
    for (const t of ["light", "dark"] as const) {
      const vars = accentCssVars(deriveAccent(DEFAULT_ACCENT, t));
      for (const [k, v] of Object.entries(vars)) expect(themes[t][k], `${t} ${k}`).toBe(v);
    }
  });

  it("meets AA for text roles on every surface", () => {
    for (const t of ["light", "dark"] as const) {
      const v = themes[t];
      const surfaces = ["--surface", "--surface-2", "--surface-sunken", "--surface-raised", "--surface-hover"].map((k) => v[k]);
      for (const bg of surfaces) {
        expect(contrastRatio(v["--text"], bg)).toBeGreaterThanOrEqual(AA_TEXT);
        expect(contrastRatio(v["--text-muted"], bg), `${t} muted on ${bg}`).toBeGreaterThanOrEqual(AA_TEXT);
        expect(contrastRatio(v["--danger"], bg), `${t} danger on ${bg}`).toBeGreaterThanOrEqual(AA_TEXT);
        expect(contrastRatio(v["--text-faint"], bg), `${t} faint on ${bg}`).toBeGreaterThanOrEqual(3);
      }
      expect(contrastRatio(v["--warning"], v["--surface"])).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(v["--on-danger"], v["--danger"])).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(v["--on-danger"], v["--danger-hover"])).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(v["--text"], v["--danger-soft"])).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(v["--danger"], v["--danger-soft"]), `${t} danger on danger-soft`).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(v["--text"], v["--warning-soft"])).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(v["--rule-strong"], v["--surface"]), `${t} control border`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("component styles", () => {
  const uiDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "ui");
  const modules = Object.fromEntries(
    readdirSync(uiDir)
      .filter((f) => f.endsWith(".module.css"))
      .map((f) => [f, read(`../../ui/${f}`)]),
  );

  it("never use raw hex colors", () => {
    expect(Object.keys(modules).length).toBeGreaterThan(5);
    for (const [file, css] of Object.entries(modules)) {
      const withoutDataUris = css.replace(/url\("data:[^"]*"\)/g, "");
      expect(withoutDataUris.match(/#[0-9a-fA-F]{3,8}\b/g), file).toBeNull();
    }
  });
});
