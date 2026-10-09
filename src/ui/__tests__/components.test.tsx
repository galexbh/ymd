import "./helpers";
import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Download } from "lucide-react";
import { Button, IconButton } from "../Button";
import { Dialog } from "../Dialog";
import { LedgerSpan, StageLine, spanFraction } from "../LedgerSpan";
import { ErrorNotice } from "../Notice";
import { SegmentedControl } from "../SegmentedControl";
import { Stamp, STRIKE_CLEAR_MS } from "../Stamp";
import { Checkbox, Switch } from "../Switch";
import { ThumbCell } from "../ThumbCell";
import { UrlField } from "../UrlField";
import { TextField } from "../TextField";
import { Accession } from "../Figure";

describe("Stamp", () => {
  it("renders the stage word and state", () => {
    const { container } = render(<Stamp stage="done" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveAttribute("data-stage", "done");
    expect(el).toHaveTextContent("Estado: Archivado");
    expect(screen.getByText("Archivado")).toBeInTheDocument();
  });

  it.each([
    ["queued", "En cola"],
    ["downloading", "Descargando"],
    ["merging", "Uniendo"],
    ["postprocessing", "Procesando"],
    ["error", "Fallido"],
    ["canceled", "Anulado"],
  ] as const)("labels %s as %s", (stage, word) => {
    render(<Stamp stage={stage} />);
    expect(screen.getByText(word)).toBeInTheDocument();
  });

  it("strikes only when the stage changes to done", () => {
    vi.useFakeTimers();
    try {
      const { container, rerender } = render(<Stamp stage="done" />);
      const el = () => container.firstElementChild as HTMLElement;
      expect(el().className).not.toMatch(/strike/);
      rerender(<Stamp stage="downloading" />);
      expect(el().className).not.toMatch(/strike/);
      rerender(<Stamp stage="done" />);
      expect(el().className).toMatch(/strike/);
      act(() => {
        vi.advanceTimersByTime(STRIKE_CLEAR_MS);
      });
      expect(el().className).not.toMatch(/strike/);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("LedgerSpan", () => {
  it("inks exactly downloaded/total", () => {
    render(<LedgerSpan value={375} max={1000} label="Avance" />);
    const bar = screen.getByRole("progressbar", { name: "Avance" });
    expect(bar).toHaveAttribute("aria-valuenow", "37.5");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    const ink = bar.firstElementChild as HTMLElement;
    expect(ink.style.width).toBe("37.5%");
  });

  it("does not round odd fractions", () => {
    render(<LedgerSpan value={1} max={3} />);
    const ink = screen.getByRole("progressbar").firstElementChild as HTMLElement;
    expect(parseFloat(ink.style.width)).toBeCloseTo(100 / 3, 10);
  });

  it("is indeterminate with no ink when the total is unknown", () => {
    render(<LedgerSpan value={5000} max={null} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).not.toHaveAttribute("aria-valuenow");
    expect(bar).toHaveAttribute("aria-valuetext", "Tamaño total aún desconocido");
    expect(bar.firstElementChild).toBeNull();
  });

  it("clamps and validates fractions", () => {
    expect(spanFraction(5, 0)).toBeNull();
    expect(spanFraction(12, 10)).toBe(1);
    expect(spanFraction(-1, 10)).toBe(0);
    expect(spanFraction(null, 10)).toBeNull();
  });

  it("marks stages on one line", () => {
    render(<StageLine stage="merging" />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((i) => i.dataset.state)).toEqual(["reached", "reached", "current", "todo"]);
    expect(items[2]).toHaveAttribute("aria-current", "step");
  });
});

describe("Button", () => {
  it("disables and keeps its label while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" loading onClick={onClick} leadingIcon={Download}>
        Ingresar
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Ingresar" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is a normal button otherwise", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Reintentar</Button>);
    const btn = screen.getByRole("button", { name: "Reintentar" });
    expect(btn).toHaveAttribute("type", "button");
    expect(btn).not.toHaveAttribute("aria-busy");
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("names icon buttons", () => {
    render(<IconButton icon={Download} aria-label="Descargar" />);
    expect(screen.getByRole("button", { name: "Descargar" })).toBeInTheDocument();
  });
});

function Seg({ onChange }: { onChange?: (v: string) => void }) {
  const [v, setV] = useState<"video" | "audio" | "both">("video");
  return (
    <SegmentedControl
      label="Tipo"
      value={v}
      onChange={(x) => {
        setV(x);
        onChange?.(x);
      }}
      options={[
        { value: "video", label: "Video" },
        { value: "audio", label: "Audio" },
        { value: "both", label: "Ambos", disabled: true },
      ]}
    />
  );
}

describe("SegmentedControl", () => {
  it("is a radio group with one tab stop", () => {
    render(<Seg />);
    expect(screen.getByRole("radiogroup", { name: "Tipo" })).toBeInTheDocument();
    const [video, audio] = screen.getAllByRole("radio");
    expect(video).toHaveAttribute("aria-checked", "true");
    expect(video).toHaveAttribute("tabindex", "0");
    expect(audio).toHaveAttribute("tabindex", "-1");
  });

  it("moves and selects with arrow keys, skipping disabled options", async () => {
    const onChange = vi.fn();
    render(<Seg onChange={onChange} />);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole("radio", { name: "Video" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Audio" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Audio" })).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Video" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Audio" })).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("audio");
  });
});

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="¿Quitar ffmpeg?">
        <button>Confirmar</button>
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("moves focus in, closes on Escape and returns focus", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const opener = screen.getByRole("button", { name: "Abrir" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "¿Quitar ffmpeg?" });
    expect(dialog).toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "Confirmar" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(dialog).not.toHaveAttribute("open");
    expect(opener).toHaveFocus();
  });

  it("closes from the labelled close button", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    await user.click(screen.getByRole("button", { name: "Cerrar diálogo" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("fields and toggles", () => {
  it("UrlField reports pastes and clears", async () => {
    const onPaste = vi.fn();
    function H() {
      const [v, setV] = useState("");
      return <UrlField value={v} onValueChange={setV} onPasteText={onPaste} />;
    }
    const user = userEvent.setup();
    render(<H />);
    const input = screen.getByRole("textbox", { name: "Enlace" });
    await user.click(input);
    await user.paste("  https://example.org/v/1 ");
    expect(onPaste).toHaveBeenCalledWith("https://example.org/v/1");
    expect(input).toHaveValue("https://example.org/v/1");
    await user.click(screen.getByRole("button", { name: "Borrar enlace" }));
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });

  it("TextField links its error", () => {
    render(<TextField label="Carpeta" error="Sin permiso" />);
    const input = screen.getByRole("textbox", { name: "Carpeta" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Sin permiso");
  });

  it("Switch and Checkbox toggle", async () => {
    const onSwitch = vi.fn();
    const onCheck = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <Switch checked={false} onChange={onSwitch} label="Usar aria2c" />
        <Checkbox checked onCheckedChange={onCheck} label="Incrustar miniatura" />
      </>,
    );
    const sw = screen.getByRole("switch", { name: "Usar aria2c" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByText("Usar aria2c"));
    expect(onSwitch).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole("checkbox", { name: "Incrustar miniatura" }));
    expect(onCheck).toHaveBeenCalledWith(false);
  });

  it("ThumbCell is a labelled checkbox", async () => {
    const onSel = vi.fn();
    const user = userEvent.setup();
    render(
      <ThumbCell
        seq={3}
        title="Estudio"
        thumbnail={null}
        selected={false}
        onSelectedChange={onSel}
      />,
    );
    const cb = screen.getByRole("checkbox", { name: /000003.*Estudio/ });
    await user.click(cb);
    expect(onSel).toHaveBeenCalledWith(true);
  });

  it("Accession pads the number", () => {
    render(<Accession seq={42} />);
    expect(screen.getByText(/000042/)).toBeInTheDocument();
  });

  it("ErrorNotice shows the translated title and next step", () => {
    render(<ErrorNotice code="bot_check" detail="ERROR: Sign in to confirm" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("YouTube pide confirmar que no eres un bot");
    expect(alert).toHaveTextContent("Ajustes → Cuentas");
    expect(alert).toHaveTextContent("ERROR: Sign in to confirm");
  });
});

describe("i18n switch", () => {
  it("renders stamps in English", async () => {
    const { setLanguage } = await import("../../i18n");
    act(() => {
      setLanguage("en");
    });
    render(<Stamp stage="done" />);
    expect(screen.getByText("Archived")).toBeInTheDocument();
    act(() => {
      setLanguage("es");
    });
  });
});
