// "Ingresar": probe if needed, resolve the destination, file the job, clear the counter.
import { toCommandError } from "../../ipc/commands";
import type { MediaKind, Preset, Settings } from "../../ipc/types";
import { pickFolder } from "../../app/native";
import { useJobs } from "../../store/jobs";
import { useReceive } from "../../store/receive";
import { presetsOfKind, useSettings } from "../../store/settings";

export const URL_INPUT_ID = "receive-url";

export function focusUrlField() {
  const tryFocus = (n: number) => {
    const el = document.getElementById(URL_INPUT_ID) as HTMLInputElement | null;
    if (el) {
      el.focus();
      el.select();
    } else if (n > 0) setTimeout(() => tryFocus(n - 1), 16);
  };
  setTimeout(() => tryFocus(10), 0);
}

/** The preset the counter will use for a kind. */
export function activePreset(
  settings: Settings | null,
  kind: MediaKind,
  chosen: string | undefined,
): Preset | undefined {
  const list = presetsOfKind(settings, kind);
  return (
    list.find((p) => p.id === chosen) ??
    list.find((p) => p.id === settings?.defaultPresetId) ??
    list[0]
  );
}

export function destinationFor(settings: Settings, preset: Preset | undefined): string {
  if (preset?.outputDir) return preset.outputDir;
  return preset?.kind === "audio" ? settings.audioDir : settings.videoDir;
}

export async function ingest(): Promise<boolean> {
  const rx = useReceive.getState();
  const settings = useSettings.getState().settings;
  if (!settings || rx.enqueueing) return false;

  let probe = rx.status === "ready" ? rx.probe : null;
  if (!probe) {
    if (rx.status === "loading") return false;
    probe = await rx.runProbe();
    // a playlist stops at the picker so entries can be chosen first
    if (!probe || probe.kind === "playlist") return false;
  }

  const kind = useReceive.getState().kind;
  const preset = activePreset(settings, kind, useReceive.getState().presetByKind[kind]);
  if (!preset) return false;

  let outputDir: string | null = null;
  if (settings.askEachTime) {
    try {
      outputDir = await pickFolder(destinationFor(settings, preset));
    } catch {
      outputDir = null;
    }
    if (!outputDir) return false;
  }

  const req = useReceive.getState().request(preset.id, outputDir);
  if (!req) return false;
  rx.setEnqueueing(true);
  try {
    await useJobs.getState().enqueue(req);
    useReceive.getState().reset();
    focusUrlField();
    return true;
  } catch (e) {
    useReceive.getState().setEnqueueing(false, toCommandError(e));
    return false;
  }
}
