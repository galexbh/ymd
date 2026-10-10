// A deliberately small Markdown subset for release notes (CHANGELOG sections): headings, nested
// "-" lists, paragraphs, **bold**, `code` and links. Pure: it returns a tree, never HTML, so
// nothing in the notes can inject markup.

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] };

export interface ListItem {
  c: Inline[];
  children: ListItem[];
}

export type Block =
  | { t: "heading"; level: number; c: Inline[] }
  | { t: "paragraph"; c: Inline[] }
  | { t: "list"; items: ListItem[] };

const INLINE =
  /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>()]+)/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  const text = (v: string) => {
    if (!v) return;
    const last = out[out.length - 1];
    if (last?.t === "text") last.v += v;
    else out.push({ t: "text", v });
  };
  let at = 0;
  for (const m of src.matchAll(INLINE)) {
    const i = m.index;
    text(src.slice(at, i));
    let end = i + m[0].length;
    if (m[1] !== undefined) out.push({ t: "strong", c: parseInline(m[1]) });
    else if (m[2] !== undefined) out.push({ t: "code", v: m[2] });
    else if (m[3] !== undefined) out.push({ t: "link", href: m[4], c: parseInline(m[3]) });
    else {
      // A bare URL ends before trailing punctuation ("…en https://x.dev/ymd/.").
      const url = m[5].replace(/[.,;:!?…»"']+$/, "");
      end = i + url.length;
      out.push({ t: "link", href: url, c: [{ t: "text", v: url }] });
    }
    at = end;
  }
  text(src.slice(at));
  return out;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const ITEM = /^(\s*)[-*+]\s+(.*)$/;

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  // Open list: its items and, per nesting depth, the item list being filled + its indent.
  let list: { items: ListItem[]; stack: { indent: number; items: ListItem[] }[] } | null = null;

  const flushPara = () => {
    if (para.length) blocks.push({ t: "paragraph", c: parseInline(para.join(" ")) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ t: "list", items: list.items });
    list = null;
  };

  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      flushPara();
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      flushPara();
      flushList();
      blocks.push({ t: "heading", level: h[1].length, c: parseInline(h[2]) });
      continue;
    }
    const it = ITEM.exec(line);
    if (it) {
      flushPara();
      const indent = it[1].replace(/\t/g, "  ").length;
      const item: ListItem = { c: parseInline(it[2]), children: [] };
      if (!list) list = { items: [], stack: [] };
      const stack = list.stack;
      while (stack.length && indent < stack[stack.length - 1].indent) stack.pop();
      const top = stack[stack.length - 1];
      if (!top) {
        list.items.push(item);
        stack.push({ indent, items: list.items });
      } else if (indent > top.indent && top.items.length) {
        const parent = top.items[top.items.length - 1];
        parent.children.push(item);
        stack.push({ indent, items: parent.children });
      } else {
        top.items.push(item);
      }
      continue;
    }
    // A continuation line of a list item ("  con sus subdominios)") joins that item's text.
    if (list && /^\s+\S/.test(raw) && !para.length) {
      const top = list.stack[list.stack.length - 1];
      const last = top.items[top.items.length - 1];
      last.c = parseInline(`${plain(last.c)} ${line.trim()}`);
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return blocks;
}

/** Inline content back to its Markdown source (used to extend a wrapped list item). */
function plain(c: Inline[]): string {
  return c
    .map((n) => {
      if (n.t === "text") return n.v;
      if (n.t === "code") return `\`${n.v}\``;
      if (n.t === "strong") return `**${plain(n.c)}**`;
      const label = plain(n.c);
      return label === n.href ? n.href : `[${label}](${n.href})`;
    })
    .join("");
}
