import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { calls, renderApp } from "../../../app/__tests__/harness";

describe("Primera ejecución", () => {
  it("installs what's needed with live progress and finishing sets onboarded", async () => {
    const { be, user, tick } = await renderApp({ scenario: "first-run" });
    expect(
      screen.getByRole("heading", { level: 1, name: "Antes del primer ingreso" }),
    ).toBeInTheDocument();
    const ledger = screen.getByTestId("deps-ledger");
    // required tools + Deno (no JS runtime on this machine); optional ones are not pushed
    expect(within(ledger).getByText("yt-dlp")).toBeInTheDocument();
    expect(within(ledger).getByText("Deno")).toBeInTheDocument();
    expect(within(ledger).queryByText("aria2c")).toBeNull();
    expect(screen.getByTestId("onboarding-finish")).toBeDisabled();

    await user.click(screen.getByTestId("onboarding-install"));
    await tick(600);
    expect(screen.getByRole("progressbar", { name: "Descargando yt-dlp" })).toBeInTheDocument();
    await tick(7000);
    expect(screen.getByText("Todo listo")).toBeInTheDocument();
    expect(calls(be, "deps_install_recommended")).toHaveLength(1);

    await user.click(screen.getByTestId("onboarding-finish"));
    await tick(0);
    await waitFor(() => expect(be.snapshot().settings.onboarded).toBe(true));
    expect(screen.getByRole("textbox", { name: "Enlace" })).toBeInTheDocument();
  });

  it("recovers from a failed install (network / rate limit) with retry", async () => {
    const { be, user, tick } = await renderApp({ scenario: "first-run", failDeps: ["ffmpeg"] });
    await user.click(screen.getByTestId("onboarding-install"));
    await tick(7000);
    expect(screen.getByText("La instalación no terminó")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-finish")).toBeDisabled();
    be.setDepFails("ffmpeg", false);
    const notice = screen
      .getByText("La instalación no terminó")
      .closest("[role=alert]") as HTMLElement;
    await user.click(within(notice).getByRole("button", { name: "Reintentar" }));
    await tick(7000);
    expect(screen.getByText("Todo listo")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-finish")).toBeEnabled();
  });

  it("chooses the Videos folder with the system picker", async () => {
    const { be, user, tick } = await renderApp({ scenario: "first-run" });
    await user.click(screen.getAllByRole("button", { name: "Cambiar" })[0]);
    await tick(0);
    await waitFor(() =>
      expect(be.snapshot().settings.videoDir).toBe("C:\\Users\\ana\\Downloads\\ymd"),
    );
  });

  it("can be skipped, and points to the cookie settings", async () => {
    const { be, user, tick } = await renderApp({ scenario: "first-run" });
    await user.click(screen.getByRole("button", { name: "Configurar cookies" }));
    await tick(0);
    expect(screen.getByTestId("settings-tab-accounts")).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByTestId("nav-receive"));
    await user.click(screen.getByTestId("onboarding-skip"));
    await tick(0);
    await waitFor(() => expect(be.snapshot().settings.onboarded).toBe(true));
  });
});
