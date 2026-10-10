import "./helpers";
import { useState, type ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Combobox, matchOptions, type ComboboxOption } from "../Combobox";

const OPTIONS: ComboboxOption[] = [
  { value: "vimeo", label: "vimeo", meta: "vimeo", keywords: ["vhx:embed"] },
  { value: "udemy", label: "Udemy", description: "Online courses", meta: "udemy" },
  { value: "twitch", label: "twitch:stream", meta: "twitch" },
  { value: "nebula", label: "Nébula", meta: "watchnebula" },
];
const OTHER: ComboboxOption = { value: "__other__", label: "Otro (avanzado)" };

function Harness({
  onChange = () => {},
  note,
  maxResults,
}: {
  onChange?: (v: string | null) => void;
  note?: (q: string) => ReactNode;
  maxResults?: number;
}) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <Combobox
        label="Sitio"
        hint="Busca el sitio"
        options={OPTIONS}
        extraOptions={[OTHER]}
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
        note={note}
        maxResults={maxResults}
      />
      <output data-testid="value">{value ?? "none"}</output>
    </form>
  );
}

const input = () => screen.getByRole("combobox", { name: "Sitio" });
const listbox = () => screen.getByRole("listbox", { hidden: true });
const optionNames = () =>
  within(listbox())
    .queryAllByRole("option")
    .map((o) => o.querySelector("span + span > span")?.textContent);

describe("matchOptions", () => {
  it("ranks label prefixes first and folds accents and case", () => {
    expect(matchOptions(OPTIONS, "").map((o) => o.value)).toEqual([
      "vimeo",
      "udemy",
      "twitch",
      "nebula",
    ]);
    expect(matchOptions(OPTIONS, "NEBU").map((o) => o.value)).toEqual(["nebula"]);
    expect(matchOptions(OPTIONS, "stream").map((o) => o.value)).toEqual(["twitch"]);
    // meta, description and keywords match after names
    expect(matchOptions(OPTIONS, "watch").map((o) => o.value)).toEqual(["nebula"]);
    expect(matchOptions(OPTIONS, "courses").map((o) => o.value)).toEqual(["udemy"]);
    expect(matchOptions(OPTIONS, "vhx").map((o) => o.value)).toEqual(["vimeo"]);
  });
});

describe("Combobox", () => {
  it("exposes the WAI-ARIA combobox roles and is closed at rest", () => {
    render(<Harness />);
    const el = input();
    expect(el).toHaveAttribute("aria-expanded", "false");
    expect(el).toHaveAttribute("aria-autocomplete", "list");
    expect(el).toHaveAttribute("aria-controls", listbox().id);
    expect(el).not.toHaveAttribute("aria-activedescendant");
    expect(el).toHaveAccessibleDescription("Busca el sitio");
    expect(listbox()).not.toBeVisible();
    expect(listbox()).toHaveAttribute("aria-labelledby", `${el.id}-label`);
    expect(document.getElementById(`${el.id}-label`)).toHaveTextContent("Sitio");
  });

  it("arrow keys move the active option via aria-activedescendant; Enter selects", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(input());
    await user.keyboard("{ArrowDown}");
    const el = input();
    expect(el).toHaveAttribute("aria-expanded", "true");
    expect(el).toHaveFocus();
    const opts = within(listbox()).getAllByRole("option");
    expect(opts).toHaveLength(5); // four sites + "Otro"
    expect(el).toHaveAttribute("aria-activedescendant", opts[0].id);
    expect(opts[0]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(el).toHaveAttribute("aria-activedescendant", opts[2].id);
    await user.keyboard("{ArrowUp}");
    expect(el).toHaveAttribute("aria-activedescendant", opts[1].id);
    // wraps around both ends
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(el).toHaveAttribute("aria-activedescendant", opts[4].id);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(el).toHaveAttribute("aria-activedescendant", opts[1].id);

    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("udemy");
    expect(el).toHaveValue("Udemy");
    expect(el).toHaveAttribute("aria-expanded", "false");
    expect(el).not.toHaveAttribute("aria-activedescendant");
  });

  it("typing filters, highlights the first match, and Enter picks it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), "twi");
    expect(optionNames()).toEqual(["twitch:stream", "Otro (avanzado)"]);
    expect(input()).toHaveAttribute(
      "aria-activedescendant",
      within(listbox()).getAllByRole("option")[0].id,
    );
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("value")).toHaveTextContent("twitch");
  });

  it("no match still offers the escape hatch", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), "zzz");
    expect(within(listbox()).getByText("Ningún sitio coincide.")).toBeInTheDocument();
    expect(optionNames()).toEqual(["Otro (avanzado)"]);
    await user.click(within(listbox()).getByRole("option", { name: /Otro/ }));
    expect(screen.getByTestId("value")).toHaveTextContent("__other__");
  });

  it("Escape closes first, then clears the selection", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), "vim");
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("value")).toHaveTextContent("vimeo");
    await user.keyboard("{ArrowDown}");
    expect(input()).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(input()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("value")).toHaveTextContent("vimeo");
    await user.keyboard("{Escape}");
    expect(input()).toHaveValue("");
    expect(screen.getByTestId("value")).toHaveTextContent("none");
  });

  it("editing the text drops the selection; an exact name is chosen on blur", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <button type="button">elsewhere</button>
      </>,
    );
    await user.type(input(), "vim");
    await user.keyboard("{Enter}");
    await user.type(input(), "x");
    expect(screen.getByTestId("value")).toHaveTextContent("none");
    await user.clear(input());
    await user.type(input(), "UDEMY");
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.getByTestId("value")).toHaveTextContent("udemy");
    expect(input()).toHaveValue("Udemy");
  });

  it("caps the rendered matches and says how many are left", async () => {
    const user = userEvent.setup();
    render(<Harness maxResults={2} />);
    await user.click(input());
    await user.keyboard("{ArrowDown}");
    expect(optionNames()).toEqual(["vimeo", "Udemy", "Otro (avanzado)"]);
    expect(within(listbox()).getByText(/2 más/)).toBeInTheDocument();
  });

  it("the toggle button opens the list without stealing focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Mostrar opciones" }));
    expect(input()).toHaveFocus();
    expect(input()).toHaveAttribute("aria-expanded", "true");
    await user.click(within(listbox()).getByRole("option", { name: /Nébula/ }));
    expect(screen.getByTestId("value")).toHaveTextContent("nebula");
  });

  it("renders the note for the current search and links it to the input", async () => {
    const user = userEvent.setup();
    render(<Harness note={(q) => (q.includes("tube") ? <p>Usa las cookies</p> : null)} />);
    expect(screen.queryByText("Usa las cookies")).toBeNull();
    await user.type(input(), "youtube");
    expect(screen.getByText("Usa las cookies")).toBeInTheDocument();
    expect(input()).toHaveAccessibleDescription(/Usa las cookies/);
  });
});
