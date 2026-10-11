import { act, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../../app/__tests__/harness";
import { useSettings } from "../../../store/settings";

const flush = () =>
  act(async () => {
    await useSettings.getState().flush();
  });

describe("Ajustes → Red", () => {
  it("is listed right after Cuentas", async () => {
    await renderApp({ route: "settings", section: "network" });
    const ids = screen.getAllByTestId(/^settings-tab-/).map((t) => t.getAttribute("data-testid"));
    expect(ids.indexOf("settings-tab-network")).toBe(ids.indexOf("settings-tab-accounts") + 1);
    expect(screen.getByTestId("settings-tab-network")).toHaveTextContent("Red");
    expect(screen.getByTestId("settings-tab-network")).toHaveAttribute("aria-current", "page");
  });

  it("saves a valid proxy normalized, never one with credentials, and clearing removes it", async () => {
    const { be, user, tick } = await renderApp({ route: "settings", section: "network" });
    const field = screen.getByRole("textbox", { name: "Dirección del proxy" });
    expect(field).toHaveAttribute("placeholder", "socks5://127.0.0.1:1080");
    expect(
      screen.getByText(
        "El proxy ve a qué sitios te conectas: usa uno de confianza. Sin usuario ni contraseña.",
      ),
    ).toBeInTheDocument();

    // nothing is saved while typing (a prefix such as `socks5h://p` is valid too)
    await user.type(field, "SOCKS5H://Proxy.Example.com:1080/");
    await tick(600);
    await flush();
    expect(be.snapshot().settings.network.proxy).toBeNull();
    await user.tab();
    await flush();
    expect(be.snapshot().settings.network.proxy).toBe("socks5h://proxy.example.com:1080");
    expect(field).toHaveValue("socks5h://proxy.example.com:1080");

    await user.clear(field);
    await user.type(field, "http://u:p@host:8080{Enter}");
    await user.tab();
    await flush();
    expect(
      screen.getByText("ymd no guarda usuario ni contraseña del proxy: quítalos de la dirección."),
    ).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    // the last valid value stays; the one with credentials never reaches settings
    expect(be.snapshot().settings.network.proxy).toBe("socks5h://proxy.example.com:1080");
    expect(JSON.stringify(be.snapshot().settings)).not.toContain("u:p@");

    await user.clear(field);
    await user.type(field, "ftp://h");
    expect(
      screen.getByText(/Escribe una dirección como socks5:\/\/127\.0\.0\.1:1080/),
    ).toBeVisible();

    await user.clear(field);
    await user.type(field, "{Enter}");
    await flush();
    expect(be.snapshot().settings.network.proxy).toBeNull();
    expect(screen.queryByText(/Escribe una dirección/)).toBeNull();
  });

  it("IP version, timeout and retries save; «Predeterminado de yt-dlp» clears them", async () => {
    const { be, user } = await renderApp({ route: "settings", section: "network" });
    expect(screen.getByRole("radio", { name: "Automática" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(screen.getByRole("radio", { name: "Solo IPv4" }));
    await flush();
    expect(be.snapshot().settings.network.ipVersion).toBe("v4");

    const timeout = screen.getByRole("combobox", { name: "Tiempo de espera" });
    expect(
      within(timeout)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Predeterminado de yt-dlp", "10 s", "20 s", "30 s", "60 s"]);
    await user.selectOptions(timeout, "30");
    const retries = screen.getByRole("combobox", { name: "Reintentos" });
    expect(
      within(retries)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Predeterminado de yt-dlp", "3", "10", "20", "50"]);
    await user.selectOptions(retries, "10");
    await flush();
    expect(be.snapshot().settings.network).toEqual({
      proxy: null,
      ipVersion: "v4",
      socketTimeoutS: 30,
      retries: 10,
    });

    await user.selectOptions(timeout, "default");
    await user.selectOptions(retries, "default");
    await user.click(screen.getByRole("radio", { name: "Automática" }));
    await flush();
    expect(be.snapshot().settings.network).toEqual({
      proxy: null,
      ipVersion: "auto",
      socketTimeoutS: null,
      retries: null,
    });
  });

  it("a stored value outside the presets still shows as itself", async () => {
    await renderApp({
      route: "settings",
      section: "network",
      settings: {
        language: "es",
        network: { proxy: null, ipVersion: "v6", socketTimeoutS: 45, retries: 0 },
      },
    });
    expect(screen.getByRole("combobox", { name: "Tiempo de espera" })).toHaveValue("45");
    expect(screen.getByRole("combobox", { name: "Reintentos" })).toHaveValue("0");
    expect(screen.getByRole("radio", { name: "Solo IPv6" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("speaks English too", async () => {
    await renderApp({ route: "settings", section: "network", settings: { language: "en" } });
    expect(screen.getByTestId("settings-tab-network")).toHaveTextContent("Network");
    expect(screen.getByRole("textbox", { name: "Proxy address" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "IPv4 only" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Speed limit" })).toBeInTheDocument();
  });
});

describe("Ajustes → Red: límite de velocidad", () => {
  it("lives in Red, not in Descargas", async () => {
    await renderApp({ route: "settings", section: "downloads" });
    expect(screen.queryByRole("combobox", { name: "Límite de velocidad" })).toBeNull();
  });

  it("«Límite de velocidad» saves a preset cap, «Otro…» a typed one, and «Sin límite» clears it", async () => {
    const { be, user, tick } = await renderApp({ route: "settings", section: "network" });
    const select = screen.getByRole("combobox", { name: "Límite de velocidad" });
    expect(select).toHaveValue("none");
    expect(
      screen.getByText("Se aplica a las descargas que empiecen a partir de ahora."),
    ).toBeInTheDocument();
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "Sin límite",
      "1 MB/s",
      "2 MB/s",
      "5 MB/s",
      "10 MB/s",
      "20 MB/s",
      "50 MB/s",
      "Otro…",
    ]);

    await user.selectOptions(select, "5");
    await flush();
    expect(be.snapshot().settings.limitRateMbps).toBe(5);
    expect(screen.queryByTestId("settings-limit-rate-custom")).toBeNull();

    await user.selectOptions(select, "other");
    const field = screen.getByRole("textbox", { name: "Límite en MB/s" });
    await user.clear(field);
    await user.type(field, "abc");
    expect(screen.getByText("Escribe un número entero entre 1 y 1000.")).toBeInTheDocument();
    await flush();
    expect(be.snapshot().settings.limitRateMbps).toBe(5);

    await user.clear(field);
    await user.type(field, "7");
    await tick(600);
    await flush();
    expect(be.snapshot().settings.limitRateMbps).toBe(7);
    expect(select).toHaveValue("other");

    await user.selectOptions(select, "none");
    await flush();
    expect(be.snapshot().settings.limitRateMbps).toBeNull();
    expect(screen.queryByTestId("settings-limit-rate-custom")).toBeNull();
  });

  it("a stored cap outside the presets opens with «Otro…» and its number", async () => {
    await renderApp({
      route: "settings",
      section: "network",
      settings: { language: "es", limitRateMbps: 7 },
    });
    expect(screen.getByRole("combobox", { name: "Límite de velocidad" })).toHaveValue("other");
    expect(screen.getByRole("textbox", { name: "Límite en MB/s" })).toHaveValue("7");
  });
});
