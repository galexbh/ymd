import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_TOASTS, pendingToastTimers, useToasts } from "../Notice";

describe("toasts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToasts.setState({ toasts: [] });
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("dismissing a toast early clears its auto-dismiss timer", () => {
    const base = pendingToastTimers();
    const id = useToasts.getState().push({ tone: "success", title: "a" });
    expect(pendingToastTimers()).toBe(base + 1);
    useToasts.getState().dismiss(id);
    expect(pendingToastTimers()).toBe(base);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("toasts evicted by newer ones take their timers with them", () => {
    const base = pendingToastTimers();
    for (let i = 0; i < MAX_TOASTS + 3; i++) {
      useToasts.getState().push({ tone: "info", title: String(i) });
    }
    expect(useToasts.getState().toasts).toHaveLength(MAX_TOASTS);
    expect(pendingToastTimers()).toBe(base + MAX_TOASTS);
    expect(vi.getTimerCount()).toBe(MAX_TOASTS);
  });

  it("an error toast has no timer; a timed one dismisses itself", () => {
    const base = pendingToastTimers();
    useToasts.getState().push({ tone: "error", title: "e" });
    expect(pendingToastTimers()).toBe(base);
    useToasts.getState().push({ tone: "info", title: "i", timeout: 1000 });
    vi.advanceTimersByTime(1000);
    expect(useToasts.getState().toasts.map((t) => t.title)).toEqual(["e"]);
    expect(pendingToastTimers()).toBe(base);
  });
});
