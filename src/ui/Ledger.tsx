import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import s from "./Ledger.module.css";
import { cx } from "./cx";

export interface LedgerProps extends HTMLAttributes<HTMLTableElement> {
  /** accessible table name (visually hidden) */
  caption: ReactNode;
  /** column widths, e.g. ["7rem", "auto", "5rem"] */
  columns?: string[];
  wrapClassName?: string;
}

/** Ruled register table; a real <table> with aligned numeric columns. */
export function Ledger({ caption, columns, className, wrapClassName, children, ...rest }: LedgerProps) {
  return (
    <div className={cx(s.wrap, wrapClassName)}>
      <table className={cx(s.ledger, className)} {...rest}>
        <caption className="visually-hidden">{caption}</caption>
        {columns && (
          <colgroup>
            {columns.map((w, i) => (
              <col key={i} style={w === "auto" ? undefined : { width: w }} />
            ))}
          </colgroup>
        )}
        {children}
      </table>
    </div>
  );
}

export function LedgerHead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cx(s.head, className)} {...rest} />;
}

export function LedgerBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export interface LedgerHeaderCellProps extends ThHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
  center?: boolean;
}

export function LedgerHeaderCell({ numeric, center, className, scope = "col", ...rest }: LedgerHeaderCellProps) {
  return <th scope={scope} className={cx(numeric && s.numeric, center && s.center, className)} {...rest} />;
}

export interface LedgerRowProps extends HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
  /** hover affordance for clickable rows */
  interactive?: boolean;
  tone?: "error" | "muted";
  "data-demo-state"?: string;
}

export function LedgerRow({ selected, interactive, tone, className, ...rest }: LedgerRowProps) {
  return (
    <tr
      className={cx(s.row, interactive && s.interactive, className)}
      data-selected={selected || undefined}
      data-tone={tone}
      {...rest}
    />
  );
}

export interface LedgerCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** right-aligned tabular mono figures */
  numeric?: boolean;
  center?: boolean;
  truncate?: boolean;
  muted?: boolean;
  /** shrink to content */
  shrink?: boolean;
}

export function LedgerCell({ numeric, center, truncate, muted, shrink, className, ...rest }: LedgerCellProps) {
  return (
    <td
      className={cx(numeric && s.numeric, center && s.center, truncate && s.truncate, muted && s.muted, shrink && s.shrink, className)}
      {...rest}
    />
  );
}
