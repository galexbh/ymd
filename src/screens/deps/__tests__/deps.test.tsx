import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { calls, renderApp } from "../../../app/__tests__/harness";

describe("Dependencias", () => {
  it("lists every tool with level, state and verification", async () => {
    await renderApp({ route: "deps" });
    for (const id of ["ytdlp", "ffmpeg", "deno", "aria2c", "atomicparsley"]) {
      expect(screen.getByTestId(`deps-row-${id}`)).toBeInTheDocument();
    }
    const ytdlp = screen.getByTestId("deps-row-ytdlp");
    expect(within(ytdlp).getByText("requerida")).toBeInTheDocument();
    expect(within(ytdlp).getByText("Instalado")).toBeInTheDocument();
    expect(within(ytdlp).getByText("verificado SHA-256")).toBeInTheDocument();
    expect(within(screen.getByTestId("deps-row-aria2c")).getByText("Falta")).toBeInTheDocument();
    // which JS runtime yt-dlp will use (Node detected in "ready")
    expect(screen.getByText("Node.js")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Instalar Deno" })).toBeNull();
    expect(screen.getByTestId("deps-bindir")).toHaveTextContent(
      "C:\\Users\\ana\\AppData\\Local\\ymd\\bin",
    );
  });

  it("install drives an exact progress span from deps://progress, then stamps it installed", async () => {
    const { user, tick } = await renderApp({ scenario: "first-run", route: "deps" });
    const row = () => screen.getByTestId("deps-row-ffmpeg");
    expect(within(row()).getByText("Falta")).toBeInTheDocument();
    await user.click(screen.getByTestId("deps-install-ffmpeg"));
    await tick(600);
    const bar = screen.getByRole("progressbar", { name: "Descargando ffmpeg" });
    const pct = Number(bar.getAttribute("aria-valuenow"));
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(100);
    expect(within(row()).getByText("Instalando")).toBeInTheDocument();
    await tick(2000);
    expect(within(row()).getByText("Instalado")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar", { name: "Descargando ffmpeg" })).toBeNull();
  });

  it("shows a failed install with the reason and a retry", async () => {
    const { be, user, tick } = await renderApp({
      scenario: "first-run",
      route: "deps",
      failDeps: ["ffmpeg"],
    });
    await user.click(screen.getByTestId("deps-install-ffmpeg"));
    await tick(2500);
    expect(screen.getByText("No se pudo instalar ffmpeg")).toBeInTheDocument();
    expect(screen.getByText(/SHA-256 mismatch/)).toBeInTheDocument();
    be.setDepFails("ffmpeg", false);
    await user.click(within(screen.getByRole("alert")).getByRole("button", { name: "Reintentar" }));
    await tick(2500);
    expect(
      within(screen.getByTestId("deps-row-ffmpeg")).getByText("Instalado"),
    ).toBeInTheDocument();
  });

  it("offers Deno when no JS runtime is detected", async () => {
    const { be, user, tick } = await renderApp({ scenario: "first-run", route: "deps" });
    expect(screen.getByText("No hay entorno JavaScript")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Instalar Deno" }));
    await tick(2500);
    expect(calls(be, "deps_install").map((c) => c.args!.id)).toEqual(["deno"]);
    expect(screen.getByText("instalado por ymd")).toBeInTheDocument();
  });

  it("checks for updates and offers Actualizar; blocked while downloads are queued", async () => {
    const { be, user, tick } = await renderApp({ scenario: "outdated", route: "deps" });
    await user.click(screen.getByTestId("deps-check"));
    await tick(0);
    expect(calls(be, "deps_report").some((c) => c.args!.checkLatest === true)).toBe(true);
    const update = screen.getByTestId("deps-update-ytdlp");
    expect(update).toBeEnabled();

    await be.invoke("enqueue", {
      req: {
        url: "https://www.youtube.com/watch?v=abcdef12345",
        presetId: "best",
        playlistItems: null,
        outputDir: null,
        videoPassword: null,
        twofactor: null,
        title: null,
        thumbnail: null,
      },
    });
    await tick(0);
    expect(screen.getByTestId("deps-update-ytdlp")).toBeDisabled();
    expect(screen.getByText(/no se puede cambiar mientras haya descargas/)).toBeInTheDocument();
  });

  it("shows the manual command with a copy button when the tool can't be installed here", async () => {
    await renderApp({ platform: "linux", route: "deps" });
    expect(screen.getByText("sudo apt install aria2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar" })).toBeInTheDocument();
  });

  it("the rail flags Dependencias when something required is missing", async () => {
    await renderApp({ scenario: "first-run", route: "deps" });
    expect(
      screen.getByRole("img", { name: "Hay dependencias que requieren atención" }),
    ).toBeInTheDocument();
  });

  it("an outdated system yt-dlp offers a managed copy that takes precedence", async () => {
    const { be, user, tick } = await renderApp({ scenario: "system-outdated", route: "deps" });
    const row = () => screen.getByTestId("deps-row-ytdlp");
    expect(within(row()).getByText("Del sistema")).toBeInTheDocument();
    expect(within(row()).getByText("C:\\yt-dlp\\yt-dlp.exe")).toBeInTheDocument();
    expect(screen.getByText(/está desactualizado/)).toBeInTheDocument();
    await user.click(screen.getByTestId("deps-install-managed-ytdlp"));
    await tick(2500);
    expect(calls(be, "deps_install").map((c) => c.args!.id)).toEqual(["ytdlp"]);
    expect(within(row()).getByText("Instalado")).toBeInTheDocument();
  });
});
