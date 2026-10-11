import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { setupI18n } from "../../i18n";
import { useSettings } from "../../store/settings";
import { createTrayNotice, trayNoticeBody } from "../trayNotice";
import { renderApp } from "./harness";

const hidden = (be: { events: { event: string }[] }) =>
  be.events.filter((e) => e.event === "app://hidden-to-tray");

describe("tray notice", () => {
  it("names the tray, or the menu bar on macOS", () => {
    setupI18n("es");
    expect(trayNoticeBody("windows")).toBe(
      "ymd sigue en la bandeja del sistema. Ciérralo desde su icono o cambia esto en Ajustes → Avanzado.",
    );
    expect(trayNoticeBody("macos")).toMatch(/^ymd sigue en la barra de menús\./);
    setupI18n("en");
    expect(trayNoticeBody("linux")).toMatch(/^ymd is still in the system tray\./);
    setupI18n("es");
  });

  it("sends one system notification and survives a failing notifier", async () => {
    const notify = vi.fn(async () => {
      throw new Error("denied");
    });
    await createTrayNotice({ platform: () => "macos", notify })();
    expect(notify).toHaveBeenCalledWith("ymd", trayNoticeBody("macos"));
  });

  it("the first X hides to the tray once: the flag is stored and kept on later saves", async () => {
    const { be, tick } = await renderApp();
    expect(useSettings.getState().settings?.trayHintShown).toBe(false);

    act(() => {
      expect(be.simulateWindowClose()).toBe(true);
    });
    await tick(0);
    await waitFor(() => expect(useSettings.getState().settings?.trayHintShown).toBe(true));
    expect(be.snapshot().settings.trayHintShown).toBe(true);
    expect(hidden(be)).toHaveLength(1);

    // the second X hides again, without another notice
    act(() => {
      expect(be.simulateWindowClose()).toBe(true);
    });
    expect(hidden(be)).toHaveLength(1);

    // a stale copy from the UI never unsets it
    const stale = { ...useSettings.getState().settings!, trayHintShown: false };
    act(() => useSettings.getState().update(() => stale));
    await act(() => useSettings.getState().flush());
    expect(be.snapshot().settings.trayHintShown).toBe(true);
  });

  it("with the setting off, the X quits and nothing is announced", async () => {
    const { be } = await renderApp({ settings: { language: "es", closeToTray: false } });
    expect(be.simulateWindowClose()).toBe(false);
    expect(hidden(be)).toHaveLength(0);
  });
});
