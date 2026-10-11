import { act, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { calls, renderApp } from "../../../app/__tests__/harness";
import { api } from "../../../ipc/commands";
import { formatClock, isLaterDay, nextOccurrence } from "../schedule";

const VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

describe("Cola → Programar inicio", () => {
  it("schedules the next occurrence, shows the banner and «Empezar ahora» clears it", async () => {
    // the control reads the wall clock: keep the simulated one in step
    const { be, user, tick } = await renderApp({ route: "queue", startTime: Date.now() });
    const button = screen.getByRole("button", { name: "Programar inicio" });
    expect(button).toBeDisabled();
    expect(screen.queryByTestId("queue-schedule-banner")).toBeNull();

    await user.type(screen.getByLabelText("Hora de inicio"), "23:30");
    expect(button).toBeEnabled();
    const expected = nextOccurrence("23:30", new Date())!;
    await user.click(button);
    await tick(0);

    const [call] = calls(be, "queue_schedule");
    const sent = new Date(String(call.args?.at));
    expect(sent.getTime()).toBe(expected.getTime());
    expect(be.snapshot().queueStartAt).not.toBeNull();

    const banner = await screen.findByTestId("queue-schedule-banner");
    const title = isLaterDay(expected, new Date())
      ? `La cola empieza mañana a las ${formatClock(expected)}`
      : `La cola empieza a las ${formatClock(expected)}`;
    expect(within(banner).getByText(title)).toBeInTheDocument();
    expect(within(banner).getByText(/Lo que esté en cola espera hasta esa hora/)).toBeVisible();

    // queued jobs just stay queued
    await act(async () => {
      await api.enqueue({
        url: VIDEO,
        presetId: "mp4-1080",
        playlistItems: null,
        outputDir: null,
        videoPassword: null,
        twofactor: null,
        clip: null,
        title: null,
        thumbnail: null,
      });
    });
    await tick(5_000);
    expect(be.snapshot().jobs[0].stage).toBe("queued");

    await user.click(within(banner).getByRole("button", { name: "Empezar ahora" }));
    await tick(0);
    expect(screen.queryByTestId("queue-schedule-banner")).toBeNull();
    expect(be.snapshot().queueStartAt).toBeNull();
    expect(be.snapshot().jobs[0].stage).toBe("downloading");
  });

  it("a schedule set elsewhere shows up through the event; «Empezar ahora» is its only action", async () => {
    const { be, user, tick } = await renderApp({ route: "queue" });
    await act(async () => {
      await api.queueSchedule(new Date(be.clock.now() + 3_600_000).toISOString());
    });
    await tick(0);
    const banner = await screen.findByTestId("queue-schedule-banner");
    expect(
      within(banner)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Empezar ahora"]);
    await user.click(within(banner).getByRole("button", { name: "Empezar ahora" }));
    await tick(0);
    expect(screen.queryByTestId("queue-schedule-banner")).toBeNull();
    expect(be.snapshot().queueStartAt).toBeNull();
  });
});
