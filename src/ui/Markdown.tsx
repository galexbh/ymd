import { Fragment, useMemo } from "react";
import { cx } from "./cx";
import { parseMarkdown, type Block, type Inline, type ListItem } from "./mdParse";
import s from "./Markdown.module.css";

export interface MarkdownProps {
  source: string;
  /** Opens a link (the app routes it to the system browser). */
  onLink?: (href: string) => void;
  className?: string;
}

/** Renders the small Markdown subset of release notes as React elements (no raw HTML). */
export function Markdown({ source, onLink, className }: MarkdownProps) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <div className={cx(s.md, className)}>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} onLink={onLink} />
      ))}
    </div>
  );
}

function BlockView({ block, onLink }: { block: Block; onLink?: (href: string) => void }) {
  if (block.t === "heading") {
    return (
      <p className={block.level <= 3 ? s.heading : s.subheading} role="heading" aria-level={4}>
        <Inlines nodes={block.c} onLink={onLink} />
      </p>
    );
  }
  if (block.t === "paragraph") {
    return (
      <p className={s.paragraph}>
        <Inlines nodes={block.c} onLink={onLink} />
      </p>
    );
  }
  return <List items={block.items} onLink={onLink} />;
}

function List({ items, onLink }: { items: ListItem[]; onLink?: (href: string) => void }) {
  return (
    <ul className={s.list}>
      {items.map((item, i) => (
        <li key={i}>
          <Inlines nodes={item.c} onLink={onLink} />
          {item.children.length > 0 && <List items={item.children} onLink={onLink} />}
        </li>
      ))}
    </ul>
  );
}

function Inlines({ nodes, onLink }: { nodes: Inline[]; onLink?: (href: string) => void }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.t === "text") return <Fragment key={i}>{n.v}</Fragment>;
        if (n.t === "code")
          return (
            <code key={i} className={s.code}>
              {n.v}
            </code>
          );
        if (n.t === "strong")
          return (
            <strong key={i}>
              <Inlines nodes={n.c} onLink={onLink} />
            </strong>
          );
        return (
          <a
            key={i}
            className={s.link}
            href={n.href}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => {
              if (!onLink) return;
              e.preventDefault();
              onLink(n.href);
            }}
          >
            <Inlines nodes={n.c} onLink={onLink} />
          </a>
        );
      })}
    </>
  );
}
