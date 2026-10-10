// Display names for presets and tools, shared by every screen.
import type { TFunction } from "i18next";
import type { DepId, Preset } from "../../ipc/types";
import { isBuiltinId } from "../../store/settings";

type BuiltinId = "best" | "mp4-1080" | "mp4-720" | "mp3-320" | "audio-original";

/** Builtin presets carry translated names; custom ones keep the user's name. */
export function presetName(t: TFunction, p: Pick<Preset, "id" | "name">): string {
  return isBuiltinId(p.id) ? t(`presets.builtin.${p.id as BuiltinId}`) : p.name;
}

/** A history row's preset: builtins translated by id, custom presets and old rows by the
 * name stored when the file was archived. */
export function historyPresetName(
  t: TFunction,
  item: { presetId: string | null; presetName: string },
): string {
  return item.presetId && isBuiltinId(item.presetId)
    ? t(`presets.builtin.${item.presetId as BuiltinId}`)
    : item.presetName;
}

/** Short format code for a ledger cell: "MP4 · 1080p", "MP3 · 320K". */
export function formatCode(t: TFunction, p: Preset | undefined): string {
  if (!p) return "—";
  if (p.kind === "audio") {
    if (p.audio.format === "best") return t("presets.code.audioOriginal");
    const q = /k$/i.test(p.audio.quality) ? ` · ${p.audio.quality.toUpperCase()}` : "";
    return `${p.audio.format.toUpperCase()}${q}`;
  }
  const c = p.video.container === "any" ? t("presets.code.auto") : p.video.container.toUpperCase();
  const h = p.video.maxHeight ? `${p.video.maxHeight}p` : t("presets.code.max");
  return `${c} · ${h}`;
}

export const DEP_NAMES: Record<DepId, string> = {
  ytdlp: "yt-dlp",
  ffmpeg: "ffmpeg",
  deno: "Deno",
  aria2c: "aria2c",
  atomicparsley: "AtomicParsley",
};

export const JS_RUNTIME_NAMES = {
  deno: "Deno",
  node: "Node.js",
  bun: "Bun",
  quickjs: "QuickJS",
} as const;
