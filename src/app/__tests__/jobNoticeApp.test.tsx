// The job notice wired into the running app: store updates in, system notification out, and
// the window's focus bringing the person to the Registro after a failure.
import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../ipc/commands";
import { useNav } from "../../store/nav";
import { GROUP_MS } from "../jobNotice";
import type * as UpdateNotice from "../updateNotice";
import { renderApp } from "./harness";

const notifySystem = vi.hoisted(() => vi.fn(async (_title: string, _body: string) => {}));
vi.mock("../updateNotice", async (orig) => ({
  ...(await orig<typeof UpdateNotice>()),
  notifySystem,
}));

function background(on: boolean) {
  vi.spyOn(document, "hasFocus").mockReturnValue(!on);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(on ? "hidden" : "visible");
}

const req = (url: string) => ({
  url,
  presetId: "best",
  playlistItems: null,
  outputDir: null,
  videoPassword: null,
  twofactor: null,
  clip: null,
  title: null,
  thumbnail: null,
});

const waitGroup = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, GROUP_MS + 50));
  });

describe("job notice in the app", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    notifySystem.mockClear();
  });

  it("a failure in the background is notified; coming back opens the Registro", async () => {
    const { tick } = await renderApp();
    background(true);
    await act(() => api.enqueue(req("https://www.youtube.com/watch?v=private1")));
    await tick(1000);
    await waitGroup();
    await waitFor(() => expect(notifySystem).toHaveBeenCalledTimes(1));
    expect(notifySystem.mock.calls[0][0]).toMatch(/^No se pudo descargar «/);
    expect(notifySystem.mock.calls[0][1]).toBe("El video es privado");
    expect(useNav.getState().route).toBe("receive");

    background(false);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(useNav.getState().route).toBe("queue");
    // only once
    act(() => useNav.getState().navigate("receive"));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(useNav.getState().route).toBe("receive");
  });

  it("nothing is sent with «notifyDownloads» off", async () => {
    const { tick } = await renderApp({ settings: { language: "es", notifyDownloads: false } });
    background(true);
    await act(() => api.enqueue(req("https://www.youtube.com/watch?v=private2")));
    await tick(1000);
    await waitGroup();
    expect(notifySystem).not.toHaveBeenCalled();
  });
});
