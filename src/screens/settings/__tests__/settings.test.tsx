import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { calls, renderApp } from "../../../app/__tests__/harness";
import { useSettings } from "../../../store/settings";
import { renderTemplate, templateHasExt } from "../template";

describe("Ajustes → Cuentas: cookies", () => {
  it("Brave running → cookies_locked guidance to close Brave, then works once closed", async () => {
    const { be, user, tick } = await renderApp({ route: "settings", section: "accounts" });
    await user.click(screen.getByRole("radio", { name: "Navegador" }));
    await tick(0);
    // Brave is listed first and flagged as open
    const brave = screen.getByRole("radio", { name: /Brave/ });
    expect(brave).toBeChecked();
    expect(screen.getByText("abierto")).toBeInTheDocument();
    await waitFor(() =>
      expect(be.snapshot().settings.cookies).toMatchObject({ kind: "browser", browser: "brave" }),
    );

    await user.click(screen.getByTestId("cookies-test"));
    await tick(0);
    expect(await screen.findByText("Brave tiene bloqueadas sus cookies")).toBeInTheDocument();
    expect(screen.getByText(/Cierra Brave por completo/)).toBeInTheDocument();

    be.setBrowserRunning("brave", false);
    await user.click(screen.getByRole("button", { name: "Ya cerré Brave, probar otra vez" }));
    await tick(0);
    expect(await screen.findByText("Las cookies funcionan")).toBeInTheDocument();
  });

  it("shows the cookies.txt export guide prominently for Brave on Windows", async () => {
    await renderApp({ route: "settings", section: "accounts" });
    const guide = await screen.findByTestId("cookie-guide");
    expect(guide).toHaveAttribute("data-prominent", "true");
    expect(within(guide).getByText(/Get cookies.txt LOCALLY/)).toBeInTheDocument();
    expect(within(guide).getAllByRole("listitem")).toHaveLength(5);
  });

  it("imports a cookies.txt from the file picker and switches the source to file", async () => {
    const { be, user, tick } = await renderApp({ route: "settings", section: "accounts" });
    await screen.findByText(
      "Aún no hay una copia. Impórtala desde el navegador o desde un archivo.",
    );
    await user.click(screen.getByTestId("cookie-pick"));
    await tick(0);
    const info = await screen.findByTestId("cookie-info");
    expect(within(info).getByText("Archivo importado")).toBeInTheDocument();
    expect(within(info).getByText("37")).toBeInTheDocument();
    expect(within(info).getByText(".youtube.com")).toBeInTheDocument();
    expect(calls(be, "cookies_import")[0].args!.path).toMatch(/cookies\.txt$/);
    await waitFor(() => expect(be.snapshot().settings.cookies).toEqual({ kind: "file" }));

    await user.click(screen.getByRole("button", { name: "Borrar copia" }));
    await tick(0);
    expect(screen.queryByTestId("cookie-info")).toBeNull();
    expect(be.snapshot().cookies).toBeNull();
  });

  it("snapshot from a closed browser saves a copy", async () => {
    const { user, tick } = await renderApp({
      route: "settings",
      section: "accounts",
      braveRunning: false,
    });
    await user.click(screen.getByRole("radio", { name: "Navegador" }));
    await tick(0);
    await user.click(screen.getByTestId("cookies-snapshot"));
    await tick(0);
    expect(await screen.findByText("Copia de cookies guardada")).toBeInTheDocument();
    expect(screen.getByTestId("cookie-info")).toHaveTextContent("brave:Personal");
  });
});

describe("Ajustes → Cuentas: site accounts", () => {
  it("adds and deletes a keychain account without ever rendering the password", async () => {
    const { be, user, tick } = await renderApp({ route: "settings", section: "accounts" });
    const form = screen.getByRole("form", { name: "Agregar cuenta" });
    const password = within(form).getByLabelText("Contraseña");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveValue("");
    await user.type(within(form).getByLabelText("Sitio"), "vimeo");
    await user.type(within(form).getByLabelText("Usuario"), "ana@example.com");
    await user.type(password, "s3cret-pass");
    await user.click(within(form).getByRole("button", { name: "Guardar cuenta" }));
    await tick(0);

    const row = await screen.findByTestId("credential-vimeo");
    expect(row).toHaveTextContent("ana@example.com");
    expect(password).toHaveValue("");
    expect(document.body.innerHTML).not.toContain("s3cret-pass");
    expect(be.snapshot().credentials).toEqual([
      { extractor: "vimeo", username: "ana@example.com" },
    ]);

    await user.click(screen.getByRole("button", { name: "Borrar la cuenta de vimeo" }));
    await tick(0);
    await waitFor(() => expect(screen.queryByTestId("credential-vimeo")).toBeNull());
    expect(be.snapshot().credentials).toEqual([]);
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
      expect(s.presets.some((p) => p.id === "custom-6" && p.audio.format === "flac")).toBe(true);
      expect(s.defaultPresetId).toBe("custom-6");
    });

    await user.click(screen.getByRole("button", { name: /^Borrar MP3 320 kbps \(copia\)/ }));
    await tick(0);
    await waitFor(() => {
      const s = be.snapshot().settings;
      expect(s.presets.some((p) => p.id === "custom-6")).toBe(false);
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
