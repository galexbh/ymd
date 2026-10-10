// Shared harness for screen tests: real App, real stores, the stateful mock backend.
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../App";
import { setupI18n } from "../../i18n";
import { installMockBackend, type MockBackend, type MockBackendOptions } from "../../ipc/mock";
import { useToasts } from "../../ui";
import { resetDepsStore } from "../../store/deps";
import { resetHistoryStore } from "../../store/history";
import { resetJobsStore } from "../../store/jobs";
import { resetNav, useNav, type Route, type SettingsSection } from "../../store/nav";
import { resetClipboardStore } from "../../store/clipboard";
import { resetReceiveStore } from "../../store/receive";
import { resetSettingsStore } from "../../store/settings";
import { useShortcutHelp } from "../shortcuts";

export function resetStores() {
  resetSettingsStore();
  resetJobsStore();
  resetDepsStore();
  resetReceiveStore();
  resetClipboardStore();
  resetHistoryStore();
  resetNav();
  useToasts.setState({ toasts: [] });
  useShortcutHelp.setState({ open: false });
}

export interface Harness {
  be: MockBackend;
  user: ReturnType<typeof userEvent.setup>;
  /** advance simulated backend time inside act() */
  tick: (ms?: number) => Promise<void>;
}

export async function renderApp(
  opts: MockBackendOptions & { route?: Route; section?: SettingsSection } = {},
): Promise<Harness> {
  const { route, section, ...backend } = opts;
  setupI18n("es");
  resetStores();
  window.history.replaceState(null, "", "#receive");
  const be = installMockBackend({ clock: "manual", settings: { language: "es" }, ...backend });
  const user = userEvent.setup();
  const tick = async (ms = 0) => {
    await act(async () => {
      await be.manualClock.advanceAsync(ms);
    });
  };
  render(<App />);
  // settings, jobs and deps load through resolved promises
  await screen.findByRole("navigation", { name: "Secciones" });
  await tick(0);
  if (route) {
    act(() => useNav.getState().navigate(route, section));
    await tick(0);
  }
  return { be, user, tick };
}

/** Paste a link into the counter the way a user does (fires the paste handler). */
export function pasteLink(url: string) {
  const input = screen.getByRole("textbox", { name: "Enlace" });
  fireEvent.paste(input, { clipboardData: { getData: () => url } });
}

export function calls(be: MockBackend, cmd: string) {
  return be.calls.filter((c) => c.cmd === cmd);
}
