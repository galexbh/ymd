import { describe, expect, it, vi } from "vitest";
import { setupI18n } from "../../i18n";
import { createUpdateNotice, type UpdateNoticeDeps } from "../updateNotice";

setupI18n("es");

function deps(over: Partial<UpdateNoticeDeps> = {}) {
  let stored: string | null = null;
  const d = {
    check: vi.fn(async () => true),
    version: vi.fn(() => "0.4.0"),
    focused: vi.fn(() => true),
    toast: vi.fn(),
    notify: vi.fn(async () => {}),
    notified: {
      get: () => stored,
      set: (v: string) => {
        stored = v;
      },
    },
    ...over,
  };
  return d;
}

describe("update notice", () => {
  it("does nothing when there is no new version", async () => {
    const d = deps({ check: vi.fn(async () => false) });
    await createUpdateNotice(d)();
    expect(d.toast).not.toHaveBeenCalled();
    expect(d.notify).not.toHaveBeenCalled();
  });

  it("toasts once per version while ymd is focused, without a system notification", async () => {
    const d = deps();
    const run = createUpdateNotice(d);
    await run();
    await run();
    expect(d.toast).toHaveBeenCalledTimes(1);
    expect(d.toast).toHaveBeenCalledWith("0.4.0");
    expect(d.notify).not.toHaveBeenCalled();
  });

  it("in the background also sends one system notification per version", async () => {
    const version = vi.fn((): string | null => "0.4.0");
    const notify = vi.fn(async (_title: string, _body: string) => {});
    const d = deps({ focused: vi.fn(() => false), version, notify });
    const run = createUpdateNotice(d);
    await run();
    await run();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]).toEqual([
      "Hay una versión nueva de ymd: 0.4.0",
      "Abre ymd para ver las novedades e instalarla con un clic.",
    ]);

    version.mockReturnValue("0.5.0");
    await run();
    expect(d.toast).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("does not notify again a version announced before a restart", async () => {
    const d = deps({ focused: vi.fn(() => false) });
    d.notified.set("0.4.0");
    await createUpdateNotice(d)();
    expect(d.toast).toHaveBeenCalledTimes(1);
    expect(d.notify).not.toHaveBeenCalled();
  });

  it("a failing notification does not break the check", async () => {
    const d = deps({
      focused: vi.fn(() => false),
      notify: vi.fn(async () => {
        throw new Error("denied");
      }),
    });
    await expect(createUpdateNotice(d)()).resolves.toBeUndefined();
  });
});
