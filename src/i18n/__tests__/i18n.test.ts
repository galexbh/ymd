import { describe, expect, it } from "vitest";
import type { ErrorCode, JobStage } from "../../ipc/types";
import en from "../en.json";
import es from "../es.json";
import { resolveLanguage } from "../index";

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

const flatEs = flatten(es as Tree);
const flatEn = flatten(en as Tree);

const ERROR_CODES = {
  bot_check: true,
  age_restricted: true,
  login_required: true,
  private: true,
  unavailable: true,
  geoblocked: true,
  ffmpeg_missing: true,
  js_runtime_missing: true,
  unsupported_url: true,
  network: true,
  cookies_locked: true,
  cookies_decrypt: true,
  disk_full: true,
  permission_denied: true,
  binary_missing: true,
  unknown: true,
} satisfies Record<ErrorCode, true>;

const STAGES = {
  queued: true,
  downloading: true,
  merging: true,
  postprocessing: true,
  done: true,
  error: true,
  canceled: true,
} satisfies Record<JobStage, true>;

describe("locales", () => {
  it("have identical key sets", () => {
    expect(Object.keys(flatEs).sort()).toEqual(Object.keys(flatEn).sort());
  });

  it("have no empty strings", () => {
    for (const [k, v] of [...Object.entries(flatEs), ...Object.entries(flatEn)]) {
      expect(v.trim(), k).not.toBe("");
    }
  });

  it("cover every error code with a title and an actionable next step", () => {
    for (const code of Object.keys(ERROR_CODES)) {
      for (const flat of [flatEs, flatEn]) {
        expect(flat[`error.${code}.title`], code).toBeTruthy();
        const action = flat[`error.${code}.action`];
        expect(action, code).toBeTruthy();
        expect(action.trim().endsWith("."), `${code} action is a sentence`).toBe(true);
      }
    }
    expect(Object.keys((es as Tree).error as Tree).sort()).toEqual(Object.keys(ERROR_CODES).sort());
  });

  it("cover every job stage", () => {
    for (const st of Object.keys(STAGES)) {
      expect(flatEs[`stage.${st}`]).toBeTruthy();
      expect(flatEn[`stage.${st}`]).toBeTruthy();
    }
  });

  it("keep the product's bot-check guidance", () => {
    expect(flatEs["error.bot_check.title"]).toBe("YouTube pide confirmar que no eres un bot");
    expect(flatEs["error.bot_check.action"]).toContain("Ajustes → Cuentas");
  });
});

describe("resolveLanguage", () => {
  it("honors explicit choices", () => {
    expect(resolveLanguage("en", ["es-HN"])).toBe("en");
    expect(resolveLanguage("es", ["en-US"])).toBe("es");
  });
  it("follows the system list for 'system'", () => {
    expect(resolveLanguage("system", ["en-US", "es"])).toBe("en");
    expect(resolveLanguage("system", ["fr-FR", "es-HN"])).toBe("es");
    expect(resolveLanguage("system", ["fr-FR"])).toBe("es");
  });
});
