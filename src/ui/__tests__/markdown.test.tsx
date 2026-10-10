import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Markdown } from "../Markdown";
import { parseInline, parseMarkdown } from "../mdParse";

// The shape of a CHANGELOG section as tauri-action puts it in latest.json.
const NOTES = `### Novedades

- **Preajuste M4A (AAC)** entre los que vienen por defecto.
- **Cuentas y cookies**
  - Extensión para Brave, \`brave://extensions\` y otros.
  - Lista con búsqueda de los sitios
    compatibles con yt-dlp.
- **Sitio de documentación**: https://galexbh.github.io/ymd/

### Correcciones

- «Abrir carpeta» no hacía nada; ver [la guía](https://galexbh.github.io/ymd/cookies/).

Texto suelto
en dos líneas.`;

describe("parseInline", () => {
  it("bold, code, links and bare URLs without trailing punctuation", () => {
    expect(parseInline("a **b** `c` [d](https://x.dev) https://y.dev/z.")).toEqual([
      { t: "text", v: "a " },
      { t: "strong", c: [{ t: "text", v: "b" }] },
      { t: "text", v: " " },
      { t: "code", v: "c" },
      { t: "text", v: " " },
      { t: "link", href: "https://x.dev", c: [{ t: "text", v: "d" }] },
      { t: "text", v: " " },
      { t: "link", href: "https://y.dev/z", c: [{ t: "text", v: "https://y.dev/z" }] },
      { t: "text", v: "." },
    ]);
  });

  it("keeps non-http links and raw HTML as plain text", () => {
    expect(parseInline("[x](javascript:alert(1)) <b>hi</b>")).toEqual([
      { t: "text", v: "[x](javascript:alert(1)) <b>hi</b>" },
    ]);
  });
});

describe("parseMarkdown", () => {
  it("builds headings, nested lists, wrapped items and paragraphs", () => {
    const blocks = parseMarkdown(NOTES);
    expect(blocks.map((b) => b.t)).toEqual(["heading", "list", "heading", "list", "paragraph"]);
    const list = blocks[1];
    if (list.t !== "list") throw new Error("list");
    expect(list.items).toHaveLength(3);
    expect(list.items[1].children).toHaveLength(2);
    const wrapped = list.items[1].children[1].c;
    expect(wrapped).toEqual([
      { t: "text", v: "Lista con búsqueda de los sitios compatibles con yt-dlp." },
    ]);
    const para = blocks[4];
    expect(para).toEqual({ t: "paragraph", c: [{ t: "text", v: "Texto suelto en dos líneas." }] });
  });

  it("handles CRLF and an empty source", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("# A\r\n\r\n- b\r\n")).toEqual([
      { t: "heading", level: 1, c: [{ t: "text", v: "A" }] },
      { t: "list", items: [{ c: [{ t: "text", v: "b" }], children: [] }] },
    ]);
  });
});

describe("<Markdown>", () => {
  it("renders headings, lists and inline marks without leaking Markdown syntax", () => {
    const { container } = render(<Markdown source={NOTES} />);
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([
      "Novedades",
      "Correcciones",
    ]);
    expect(container.querySelectorAll("ul ul li")).toHaveLength(2);
    expect(screen.getByText("Preajuste M4A (AAC)").tagName).toBe("STRONG");
    expect(screen.getByText("brave://extensions").tagName).toBe("CODE");
    expect(container.textContent).not.toMatch(/\*\*|###|`/);
  });

  it("hands links to onLink instead of navigating the webview", async () => {
    const onLink = vi.fn();
    render(<Markdown source={NOTES} onLink={onLink} />);
    await userEvent.click(screen.getByRole("link", { name: "la guía" }));
    expect(onLink).toHaveBeenCalledWith("https://galexbh.github.io/ymd/cookies/");
  });
});
