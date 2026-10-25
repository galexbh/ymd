// "Descargar": probe if needed, resolve the destination, file the job, clear the counter.
import { toCommandError } from "../../ipc/commands";
import type { MediaKind, Preset, Settings } from "../../ipc/types";
import { pickFolder } from "../../app/native";
import i18n from "../../i18n";
import { useJobs } from "../../store/jobs";
import { useReceive } from "../../store/receive";
import { presetsOfKind, useSettings } from "../../store/settings";
import { useToasts } from "../../ui";

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

/**
 * The folder to pass with the request: null to use the preset's shelf, or the one picked when
 * "ask each time" is on. undefined when the picker was dismissed (file nothing).
 */
async function chooseOutputDir(
  settings: Settings,
  preset: Preset,
): Promise<string | null | undefined> {
  if (!settings.askEachTime) return null;
  try {
    return (await pickFolder(destinationFor(settings, preset))) || undefined;
  } catch {
    return undefined;
  }
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

  const outputDir = await chooseOutputDir(settings, preset);
  if (outputDir === undefined) return false;

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

/**
 * "Encolar N": file every link of the pasted batch with the counter's preset, asking for the
 * folder once. Links the backend refuses are counted in the summary toast; the rest still go.
 */
export async function ingestBatch(): Promise<boolean> {
  const rx = useReceive.getState();
  const settings = useSettings.getState().settings;
  if (!settings || !rx.batch || rx.enqueueing) return false;

  const preset = activePreset(settings, rx.kind, rx.presetByKind[rx.kind]);
  if (!preset) return false;
  const outputDir = await chooseOutputDir(settings, preset);
  if (outputDir === undefined) return false;

  const reqs = useReceive.getState().batchRequests(preset.id, outputDir);
  if (reqs.length === 0) return false;
  rx.setEnqueueing(true);
  let filed = 0;
  let lastError: unknown = null;
  for (const req of reqs) {
    try {
      await useJobs.getState().enqueue(req);
      filed++;
    } catch (e) {
      lastError = e;
    }
  }
  if (filed === 0) {
    useReceive.getState().setEnqueueing(false, toCommandError(lastError));
    return false;
  }
  const failed = reqs.length - filed;
  useToasts.getState().push(
    failed === 0
      ? { tone: "success", title: i18n.t("receive.batch.filed", { count: filed }) }
      : {
          tone: "warning",
          title: i18n.t("receive.batch.filed", { count: filed }),
          body: i18n.t("receive.batch.failed", { count: failed }),
        },
  );
  useReceive.getState().reset();
  focusUrlField();
  return true;
}
