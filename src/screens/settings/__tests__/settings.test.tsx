import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { calls, renderApp } from "../../../app/__tests__/harness";
import { resetAppUpdate, useAppUpdate } from "../../../store/appUpdate";
import { useNav } from "../../../store/nav";
import { useSettings } from "../../../store/settings";
import { renderTemplate, templateHasExt } from "../template";

describe("Ajustes → Cuentas: origen de las cookies", () => {
  it("offers Ninguno, Extensión and Firefox; no manual cookies.txt, no Chromium browsers", async () => {
    const { user, tick } = await renderApp({ route: "settings", section: "accounts" });
    for (const name of ["Ninguno", "Extensión", "Firefox"]) {
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("radio", { name: "Archivo cookies.txt" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Navegador" })).toBeNull();
    expect(screen.queryByText(/cookies\.txt/)).toBeNull();
    // nothing extra until a source is picked
    expect(screen.queryByTestId("extension-card")).toBeNull();
    expect(screen.queryByTestId("cookie-guide")).toBeNull();

    await user.click(screen.getByRole("radio", { name: "Firefox" }));
    await tick(0);
    expect(await screen.findByTestId("browser-firefox")).toBeInTheDocument();
    for (const chromium of ["brave", "chrome", "edge", "opera", "vivaldi"]) {
      expect(screen.queryByTestId(`browser-${chromium}`)).toBeNull();
    }
    expect(screen.queryByText("abierto")).toBeNull();
  });

  it("Extensión shows the extension card and saves the source", async () => {
    const { be, user, tick } = await renderApp({ route: "settings", section: "accounts" });
    await user.click(screen.getByRole("radio", { name: "Extensión" }));
    await tick(0);
    const card = await screen.findByTestId("extension-card");
    expect(card).toHaveAttribute("data-prominent", "true");
    expect(screen.queryByTestId("cookie-guide")).toBeNull();
    await waitFor(() => expect(be.snapshot().settings.cookies).toEqual({ kind: "extension" }));
    expect(screen.getByText(/navegadores Chromium: la extensión de ymd envía/)).toBeInTheDocument();
  });

  it("the copy comes from the extension and «Borrar copia» deletes it", async () => {
    const { be, user, tick } = await renderApp();
    be.simulateExtensionSync("brave", 42, [".youtube.com"]);
    act(() => useNav.getState().navigate("settings", "accounts"));
    await tick(0);
    const info = await screen.findByTestId("cookie-info");
    expect(within(info).getByText("extension:brave")).toBeInTheDocument();
    expect(within(info).getByText("42")).toBeInTheDocument();
    expect(within(info).getByTestId("cookie-session")).toHaveTextContent("Activa");

    await user.click(screen.getByRole("button", { name: "Borrar copia" }));
    await tick(0);
    expect(screen.queryByTestId("cookie-info")).toBeNull();
    expect(be.snapshot().cookies).toBeNull();
    expect(
      screen.getByText("Aún no hay una copia. La crea la extensión de ymd al sincronizar."),
    ).toBeInTheDocument();
  });

  it("Firefox: the test reads it directly, with no manual copy", async () => {
    const { be, user, tick } = await renderApp({ route: "settings", section: "accounts" });
    await user.click(screen.getByRole("radio", { name: "Firefox" }));
    await tick(0);
    await waitFor(() =>
      expect(be.snapshot().settings.cookies).toMatchObject({ kind: "browser", browser: "firefox" }),
    );
    await user.click(screen.getByTestId("cookies-test"));
    await tick(0);
    expect(await screen.findByText("Las cookies funcionan")).toBeInTheDocument();
    expect(screen.queryByTestId("cookies-snapshot")).toBeNull();
    expect(screen.queryByText("Importar desde el navegador ahora")).toBeNull();
  });

  it("an absent Firefox is listed with its download link", async () => {
    const { be, user, tick } = await renderApp({
      route: "settings",
      section: "accounts",
      firefoxInstalled: false,
    });
    await user.click(screen.getByRole("radio", { name: "Firefox" }));
    await tick(0);
    const row = await screen.findByTestId("browser-firefox");
    expect(within(row).getByRole("radio")).toBeDisabled();
    expect(within(row).getByText("no instalado")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Descargar Firefox" }));
    await tick(0);
    const opened = calls(be, "plugin:opener|open_url");
    expect(opened).toHaveLength(1);
    expect(JSON.stringify(opened[0])).toContain("mozilla.org/firefox");
  });
});

// Synthetic value built at runtime: it only proves the field is never echoed to the DOM.
const TYPED_VALUE = ["typed", "in", "test", String(Date.now() % 1000)].join("-");

describe("Ajustes → Cuentas: site accounts", () => {
  it("adds and deletes a keychain account without ever rendering the password", async () => {
    const { be, user, tick } = await renderApp({ route: "settings", section: "accounts" });
    const form = screen.getByRole("form", { name: "Agregar cuenta" });
    const password = within(form).getByLabelText("Contraseña");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveValue("");
    const site = within(form).getByRole("combobox", { name: "Sitio" });
    await user.type(site, "vime");
    await user.click(within(form).getByRole("option", { name: /^vimeo/ }));
    expect(site).toHaveValue("vimeo");
    await user.type(within(form).getByLabelText("Usuario"), "ana@example.com");
    await user.type(password, TYPED_VALUE);
    await user.click(within(form).getByRole("button", { name: "Guardar cuenta" }));
    await tick(0);

    const row = await screen.findByTestId("credential-vimeo");
    expect(row).toHaveTextContent("ana@example.com");
    expect(password).toHaveValue("");
    expect(document.body.innerHTML).not.toContain(TYPED_VALUE);
    expect(be.snapshot().credentials).toEqual([
      { extractor: "vimeo", username: "ana@example.com" },
    ]);
    expect(calls(be, "credentials_set").map((c) => c.args?.extractor)).toEqual(["vimeo"]);
    // the picker is cleared for the next account
    expect(site).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Borrar la cuenta de vimeo" }));
    await tick(0);
    await waitFor(() => expect(screen.queryByTestId("credential-vimeo")).toBeNull());
    expect(be.snapshot().credentials).toEqual([]);
  });

  it("«Otro (avanzado)» validates the key with the keychain alphabet", async () => {
    const { be, user, tick } = await renderApp({ route: "settings", section: "accounts" });
    const form = screen.getByRole("form", { name: "Agregar cuenta" });
    const site = within(form).getByRole("combobox", { name: "Sitio" });
    await user.type(site, "zzz-no-such-site");
    await user.click(within(form).getByRole("option", { name: /Otro \(avanzado\)/ }));
    const key = within(form).getByLabelText("Clave del sitio");
    const submit = within(form).getByRole("button", { name: "Guardar cuenta" });
    await user.type(within(form).getByLabelText("Usuario"), "ana");
    await user.type(within(form).getByLabelText("Contraseña"), TYPED_VALUE);

    await user.type(key, "-bad key");
    expect(within(form).getByText(/Usa solo minúsculas/)).toBeInTheDocument();
    expect(key).toHaveAttribute("aria-invalid", "true");
    expect(submit).toBeDisabled();

    await user.clear(key);
    await user.type(key, "  MySite.TV ");
    expect(key).not.toHaveAttribute("aria-invalid");
    await user.click(submit);
    await tick(0);
    expect(calls(be, "credentials_set").map((c) => c.args?.extractor)).toEqual(["mysite.tv"]);
    expect(await screen.findByTestId("credential-mysite.tv")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(TYPED_VALUE);
  });

  it("searching YouTube explains it takes cookies, not a password", async () => {
    const { user } = await renderApp({ route: "settings", section: "accounts" });
    const form = screen.getByRole("form", { name: "Agregar cuenta" });
    await user.type(within(form).getByRole("combobox", { name: "Sitio" }), "youtube");
    expect(within(form).getByText("YouTube no acepta usuario y contraseña")).toBeInTheDocument();
    expect(within(form).queryByRole("option", { name: /^youtube/i })).toBeNull();
    const cookies = document.getElementById("accounts-cookies")!;
    await user.click(within(form).getByRole("button", { name: "Ir a las cookies" }));
    expect(cookies).toHaveFocus();
  });
});

describe("Ajustes → Cuentas: sitios compatibles", () => {
  it("is collapsed, then searches, filters, paginates and marks", async () => {
    const { user } = await renderApp({ route: "settings", section: "accounts" });
    const section = screen.getByTestId("supported-sites");
    expect(within(section).getByText(/^1\.\d{3}$/)).toBeInTheDocument();
    expect(within(section).queryByRole("table")).toBeNull();

    await user.click(within(section).getByRole("button", { name: "Mostrar la lista" }));
    expect(within(section).getAllByTestId("supported-row")).toHaveLength(25);
    expect(within(section).getByTestId("supported-range")).toHaveTextContent(/^1–25 de 1\.\d{3}$/);

    await user.click(within(section).getByRole("button", { name: "Siguiente" }));
    expect(within(section).getByTestId("supported-range")).toHaveTextContent(/^26–50 de/);

    await user.type(within(section).getByRole("searchbox", { name: "Buscar sitio" }), "vimeo");
    const rows = within(section).getAllByTestId("supported-row");
    expect(rows[0]).toHaveTextContent("vimeo");
    expect(within(rows[0]).getByText("admite cuenta")).toBeInTheDocument();
    // search resets to the first page
    expect(within(section).queryByTestId("supported-range")).toBeNull();

    await user.clear(within(section).getByRole("searchbox", { name: "Buscar sitio" }));
    await user.click(within(section).getByRole("radio", { name: "Roto" }));
    const broken = within(section).getAllByTestId("supported-row");
    for (const row of broken)
      expect(within(row).getByText("no funciona por ahora")).toBeInTheDocument();

    await user.click(within(section).getByRole("radio", { name: "Admite cuenta" }));
    for (const row of within(section).getAllByTestId("supported-row"))
      expect(within(row).getByText("admite cuenta")).toBeInTheDocument();

    await user.type(
      within(section).getByRole("searchbox", { name: "Buscar sitio" }),
      "no-such-site-anywhere",
    );
    expect(within(section).getByText(/Ningún sitio coincide/)).toBeInTheDocument();
    expect(within(section).getByTestId("supported-count")).toHaveTextContent(/^0/);
  });

  it("links to the official list and to yt-dlp's issues", async () => {
    const { be, user } = await renderApp({ route: "settings", section: "accounts" });
    await user.click(screen.getByRole("button", { name: "Ver la lista oficial" }));
    await user.click(screen.getByRole("button", { name: "Abrir los issues de yt-dlp" }));
    const urls = calls(be, "plugin:opener|open_url").map((c) => c.args?.url);
    expect(urls).toEqual([
      "https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md",
      "https://github.com/yt-dlp/yt-dlp/issues",
    ]);
    const howto = screen.getByTestId("howto-more");
    await user.click(within(howto).getByRole("button", { name: "Ir a las cookies" }));
    expect(document.getElementById("accounts-cookies")).toHaveFocus();
  });
});

describe("Ajustes → Idioma y Apariencia", () => {
  it("switches the language immediately and persists it", async () => {
    const { be, user, tick } = await renderApp({ route: "settings", section: "language" });
    await user.click(screen.getByRole("radio", { name: "English" }));
    await tick(0);
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(screen.getByTestId("nav-receive")).toHaveTextContent("Receive");
    expect(document.documentElement.lang).toBe("en");
    await waitFor(() => expect(be.snapshot().settings.language).toBe("en"));
    await user.click(screen.getByRole("radio", { name: "Español" }));
    expect(screen.getByRole("heading", { level: 1, name: "Ajustes" })).toBeInTheDocument();
  });

  it("switches theme, accent and density and shows Guardado", async () => {
    const { be, user, tick } = await renderApp({ route: "settings", section: "appearance" });
    await user.click(screen.getByRole("radio", { name: "Oscuro" }));
    await tick(0);
    expect(document.documentElement.dataset.theme).toBe("dark");
    await user.click(screen.getByRole("radio", { name: "Claro" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    await user.click(screen.getByTestId("settings-accent-teal"));
    await user.click(screen.getByRole("radio", { name: "Compacta" }));
    await tick(0);
    expect(document.documentElement.dataset.density).toBe("compact");
    await waitFor(() =>
      expect(be.snapshot().settings.theme).toMatchObject({
        mode: "light",
        accent: "#0f6b6b",
        density: "compact",
      }),
    );
    expect(await screen.findByTestId("save-state")).toHaveTextContent("Guardado");
    expect(screen.getByTestId("appearance-preview")).toBeInTheDocument();
  });

  it("explains when a custom accent was adjusted for contrast", async () => {
    const { user } = await renderApp({ route: "settings", section: "appearance" });
    await user.type(screen.getByLabelText("Personalizado"), "#ffff00");
    await waitFor(() =>
      expect(screen.getByText("Ajustamos el tono para que se lea bien.")).toBeInTheDocument(),
    );
  });
});

describe("Ajustes → Descargas", () => {
  it("renders a live example of the file name template and rejects one without %(ext)s", async () => {
    const { user } = await renderApp({ route: "settings", section: "downloads" });
    const field = screen.getByLabelText("Plantilla");
    expect(screen.getByTestId("template-example")).toHaveTextContent(
      "Volcanes de Centroamérica desde el aire [dQw4w9WgXcQ].mp4",
    );
    await user.clear(field);
    await user.type(field, "%(uploader)s - %(title)s");
    expect(
      screen.getByText("Incluye %(ext)s para que el archivo conserve su extensión."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("template-example")).toHaveTextContent("Geo Andes - Volcanes");
  });

  it("concurrency slider persists within 1–8 and aria2c needs aria2c installed", async () => {
    const { be } = await renderApp({ route: "settings", section: "downloads" });
    const slider = screen.getByRole("slider", { name: "Descargas a la vez" });
    fireEvent.change(slider, { target: { value: "6" } });
    await act(async () => {
      await useSettings.getState().flush();
    });
    expect(be.snapshot().settings.concurrency).toBe(6);
    expect(screen.getByRole("switch", { name: /Usar aria2c/ })).toBeDisabled();
    expect(screen.getByText("Instala aria2c en Dependencias para activarlo.")).toBeInTheDocument();
  });
});

describe("Ajustes → Preajustes", () => {
  it("builtin presets only allow postprocess and folder changes; custom ones can be created and deleted", async () => {
    const { be, user, tick } = await renderApp({ route: "settings", section: "presets" });
    await user.click(screen.getByRole("button", { name: "Editar MP4 1080p" }));
    const editor = screen.getByTestId("preset-editor");
    expect(within(editor).getByLabelText("Altura máxima")).toBeDisabled();
    await user.click(within(editor).getByRole("checkbox", { name: /Patrocinio/ }));
    await user.click(within(editor).getByTestId("preset-save"));
    await tick(0);
    await waitFor(() =>
      expect(
        be.snapshot().settings.presets.find((p) => p.id === "mp4-1080")!.postprocess
          .sponsorblockRemove,
      ).toEqual(["sponsor"]),
    );

    await user.click(screen.getByRole("button", { name: "Duplicar MP3 320 kbps" }));
    const dup = screen.getByTestId("preset-editor");
    expect(within(dup).getByLabelText("Formato de audio")).toBeEnabled();
    await user.selectOptions(within(dup).getByLabelText("Formato de audio"), "flac");
    await user.click(
      within(dup).getByRole("checkbox", { name: "Usar como preajuste predeterminado" }),
    );
    await user.click(within(dup).getByTestId("preset-save"));
    await tick(0);
    await waitFor(() => {
      const s = be.snapshot().settings;
      expect(s.presets.some((p) => p.id === "custom-7" && p.audio.format === "flac")).toBe(true);
      expect(s.defaultPresetId).toBe("custom-7");
    });

    await user.click(screen.getByRole("button", { name: /^Borrar MP3 320 kbps \(copia\)/ }));
    await tick(0);
    await waitFor(() => {
      const s = be.snapshot().settings;
      expect(s.presets.some((p) => p.id === "custom-7")).toBe(false);
      expect(s.defaultPresetId).toBe("best");
    });
    expect(screen.getByText(/Preajuste «MP3 320 kbps \(copia\)» borrado/)).toBeInTheDocument();
  });
});

describe("template", () => {
  it("renders common yt-dlp fields", () => {
    expect(renderTemplate("%(title).10B [%(id)s].%(ext)s")).toBe("Volcanes d [dQw4w9WgXcQ].mp4");
    expect(renderTemplate("%(playlist_index)03d - %(nope)s")).toBe("003 - NA");
    expect(templateHasExt("%(title)s")).toBe(false);
  });
});

describe("Ajustes → Avanzado: actualización de ymd", () => {
  it("shows the release notes formatted, not as raw Markdown", async () => {
    await renderApp({ route: "settings", section: "advanced" });
    act(() =>
      useAppUpdate.setState({
        status: "available",
        version: "0.4.0",
        notes: "### Novedades\n\n- **Preajuste M4A** por defecto.\n  - Con `m4a` sin recodificar.",
      }),
    );
    const notes = await screen.findByTestId("app-update-notes");
    expect(notes).toHaveAccessibleName("Novedades de la versión 0.4.0");
    expect(within(notes).getByRole("heading", { name: "Novedades" })).toBeInTheDocument();
    expect(within(notes).getByText("Preajuste M4A").tagName).toBe("STRONG");
    expect(within(notes).getByText("m4a").tagName).toBe("CODE");
    expect(notes.textContent).not.toMatch(/\*\*|###/);
    act(() => resetAppUpdate());
  });
});
