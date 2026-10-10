import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMocks } from "@tauri-apps/api/mocks";
import { setupI18n } from "../../i18n";
import i18n from "../../i18n";
import { installMockBackend } from "../../ipc/mock";
import { useTheme } from "../../theme/useTheme";
import {
  SAVED_VISIBLE_MS,
  newPresetId,
  presetsOfKind,
  resetSettingsStore,
  sanitizeLocal,
  useSettings,
} from "../settings";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sets = (be: ReturnType<typeof installMockBackend>) =>
  be.calls.filter((c) => c.cmd === "settings_set");

describe("settings store", () => {
  beforeEach(() => {
    setupI18n("es");
    resetSettingsStore();
  });

  it("loads settings and applies theme and language", async () => {
    installMockBackend({
      settings: {
        language: "en",
        theme: { mode: "dark", accent: null, density: "compact", radius: "sharp", fontScale: 1.1 },
      },
    });
    await useSettings.getState().load();
    expect(useSettings.getState().settings?.language).toBe("en");
    expect(i18n.language).toBe("en");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.density).toBe("compact");
    expect(useTheme.getState().settings.radius).toBe("sharp");
  });

  it("persists an update and reports Guardado", async () => {
    const be = installMockBackend();
    await useSettings.getState().load();
    useSettings.getState().update({ askEachTime: true });
    expect(useSettings.getState().settings?.askEachTime).toBe(true);
    await useSettings.getState().flush();
    expect(be.snapshot().settings.askEachTime).toBe(true);
    expect(useSettings.getState().status).toBe("saved");
  });

  it("sanitizes locally at once and adopts the backend's sanitized copy", async () => {
    const be = installMockBackend();
    await useSettings.getState().load();
    useSettings.getState().update((s) => ({
      ...s,
      concurrency: 12,
      theme: { ...s.theme, fontScale: 3 },
      filenameTemplate: "  ",
    }));
    const local = useSettings.getState().settings!;
    expect(local.concurrency).toBe(8);
    expect(local.theme.fontScale).toBe(1.25);
    await useSettings.getState().flush();
    const after = useSettings.getState().settings!;
    expect(after.filenameTemplate).toBe(be.snapshot().settings.filenameTemplate);
    expect(after.filenameTemplate.trim()).not.toBe("");
    expect(be.snapshot().settings.concurrency).toBe(8);
  });

  it("debounces rapid changes (sliders, text) into one write", async () => {
    const be = installMockBackend();
    await useSettings.getState().load();
    const before = sets(be).length;
    for (const c of [2, 3, 4, 5])
      useSettings.getState().update({ concurrency: c }, { debounce: 30 });
    await wait(80);
    await useSettings.getState().flush();
    expect(sets(be).length - before).toBe(1);
    expect(be.snapshot().settings.concurrency).toBe(5);
  });

  it("keeps the local value when the user changed it again while saving", async () => {
    installMockBackend({ delays: { command: 0 } });
    await useSettings.getState().load();
    useSettings.getState().update({ concurrency: 2 });
    useSettings.getState().update({ concurrency: 6 });
    await useSettings.getState().flush();
    await wait(10);
    expect(useSettings.getState().settings?.concurrency).toBe(6);
  });

  describe("«Guardado» is a confirmation that fades", () => {
    afterEach(() => vi.useRealTimers());

    it("returns to idle after a short delay", async () => {
      installMockBackend();
      await useSettings.getState().load();
      vi.useFakeTimers();
      useSettings.getState().update({ askEachTime: true });
      await useSettings.getState().flush();
      expect(useSettings.getState().status).toBe("saved");
      await vi.advanceTimersByTimeAsync(SAVED_VISIBLE_MS - 100);
      expect(useSettings.getState().status).toBe("saved");
      await vi.advanceTimersByTimeAsync(200);
      expect(useSettings.getState().status).toBe("idle");
    });

    it("a new save restarts the delay", async () => {
      installMockBackend();
      await useSettings.getState().load();
      vi.useFakeTimers();
      useSettings.getState().update({ askEachTime: true });
      await useSettings.getState().flush();
      await vi.advanceTimersByTimeAsync(SAVED_VISIBLE_MS - 500);
      useSettings.getState().update({ askEachTime: false });
      await useSettings.getState().flush();
      await vi.advanceTimersByTimeAsync(SAVED_VISIBLE_MS - 500);
      expect(useSettings.getState().status).toBe("saved");
      await vi.advanceTimersByTimeAsync(600);
      expect(useSettings.getState().status).toBe("idle");
    });

    it("an error stays until the user retries", async () => {
      installMockBackend();
      await useSettings.getState().load();
      clearMocks(); // no backend: the next write fails
      vi.useFakeTimers();
      useSettings.getState().update({ askEachTime: true });
      await useSettings.getState().flush();
      expect(useSettings.getState().status).toBe("error");
      await vi.advanceTimersByTimeAsync(SAVED_VISIBLE_MS * 4);
      expect(useSettings.getState().status).toBe("error");
    });
  });

  it("reports a failed load", async () => {
    // no backend installed: invoke rejects
    await useSettings.getState().load();
    expect(useSettings.getState().settings).toBeNull();
    expect(useSettings.getState().loadError).not.toBeNull();
  });

  it("helpers", async () => {
    installMockBackend();
    const s = (await useSettings.getState().load())!;
    expect(presetsOfKind(s, "audio").map((p) => p.id)).toEqual([
      "mp3-320",
      "m4a",
      "audio-original",
    ]);
    expect(newPresetId(s.presets)).toBe("custom-7");
    expect(sanitizeLocal({ ...s, concurrency: Number.NaN }).concurrency).toBe(3);
  });
});
