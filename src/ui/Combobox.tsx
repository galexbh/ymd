import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import f from "./Field.module.css";
import s from "./Combobox.module.css";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { FieldFrame, describedBy, labelId } from "./TextField";

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  /** short code shown in mono at the end of the row, e.g. a site key */
  meta?: string;
  /** extra words the search matches */
  keywords?: string[];
}

export interface ComboboxProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  placeholder?: string;
  options: ComboboxOption[];
  /** always listed after the matches, whatever the search, e.g. an "Other" escape hatch */
  extraOptions?: ComboboxOption[];
  /** selected option value, or null */
  value: string | null;
  onChange: (value: string | null) => void;
  /** inline note under the field for the current search text */
  note?: (query: string) => ReactNode;
  /** matches rendered at once; the rest are reached by typing more */
  maxResults?: number;
  id?: string;
  className?: string;
  "data-testid"?: string;
}

/** Lowercase and accent-free, so "Ñ" and "é" match plain typing. */
const fold = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Matches for a search, best first: label prefix, then label, then the rest. */
export function matchOptions(options: ComboboxOption[], query: string): ComboboxOption[] {
  const q = fold(query.trim());
  if (!q) return options;
  const scored: [number, ComboboxOption][] = [];
  for (const o of options) {
    const label = fold(o.label);
    let rank = -1;
    if (label.startsWith(q) || fold(o.value).startsWith(q)) rank = 0;
    else if (label.includes(q) || fold(o.value).includes(q)) rank = 1;
    else if (
      (o.meta && fold(o.meta).includes(q)) ||
      (o.description && fold(o.description).includes(q)) ||
      o.keywords?.some((k) => fold(k).includes(q))
    )
      rank = 2;
    if (rank >= 0) scored.push([rank, o]);
  }
  return scored.sort((a, b) => a[0] - b[0]).map(([, o]) => o);
}

/**
 * Editable combobox with a listbox popup (WAI-ARIA APG "list autocomplete").
 * Focus stays in the input; the highlighted option is exposed via aria-activedescendant.
 */
export function Combobox({
  label,
  hint,
  error,
  placeholder,
  options,
  extraOptions = [],
  value,
  onChange,
  note,
  maxResults = 60,
  id: idProp,
  className,
  "data-testid": testId,
}: ComboboxProps) {
  const { t } = useTranslation();
  const autoId = useId();
  const id = idProp ?? autoId;
  const listId = `${id}-listbox`;
  const noteId = `${id}-note`;
  const optId = (i: number) => `${id}-opt-${i}`;
  const inputRef = useRef<HTMLInputElement>(null);

  const all = useMemo(() => [...options, ...extraOptions], [options, extraOptions]);
  const selected = all.find((o) => o.value === value) ?? null;
  // null = not editing: the input shows the selected option's label
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const text = query ?? selected?.label ?? "";
  const matches = useMemo(() => matchOptions(options, query ?? ""), [options, query]);
  const shown = matches.slice(0, maxResults);
  const hidden = matches.length - shown.length;
  const items = [...shown, ...extraOptions];

  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(`${id}-opt-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, id]);

  const openAt = (i: number) => {
    setOpen(true);
    setActive(i);
  };
  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  const choose = (o: ComboboxOption) => {
    setQuery(null);
    close();
    if (o.value !== value) onChange(o.value);
  };

  const onType = (next: string) => {
    setQuery(next);
    if (value !== null) onChange(null);
    setOpen(true);
    setActive(next.trim() && matchOptions(options, next).length > 0 ? 0 : -1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const n = items.length;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) {
          const cur = items.findIndex((o) => o.value === value);
          openAt(e.altKey ? -1 : Math.max(cur, 0));
        } else if (n) setActive((a) => (a + 1) % n);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) openAt(n - 1);
        else if (n) setActive((a) => (a <= 0 ? n - 1 : a - 1));
        break;
      case "Enter":
        if (open && active >= 0 && active < n) {
          e.preventDefault();
          choose(items[active]);
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          close();
          if (query !== null && value !== null) setQuery(null);
        } else if (text) {
          e.preventDefault();
          setQuery(null);
          if (value !== null) onChange(null);
        }
        break;
      case "Tab":
        close();
        break;
    }
  };

  // Typing an exact name and leaving the field counts as choosing it.
  const onBlur = () => {
    close();
    if (query === null) return;
    const q = fold(query.trim());
    const exact = q && options.find((o) => fold(o.label) === q || fold(o.value) === q);
    if (exact) choose(exact);
  };

  const noteContent = note?.(query ?? "");

  return (
    <div className={cx(s.combo, className)} data-testid={testId}>
      <FieldFrame id={id} label={label} hint={hint} error={error}>
        <div
          className={cx(f.control, s.control)}
          data-invalid={error ? "true" : undefined}
          data-open={open || undefined}
        >
          <input
            ref={inputRef}
            id={id}
            className={f.input}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && active >= 0 ? optId(active) : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(id, hint, error, noteContent ? noteId : undefined)}
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholder}
            value={text}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
            onClick={() => !open && openAt(-1)}
          />
          <button
            type="button"
            className={s.toggle}
            tabIndex={-1}
            aria-label={t("ui.combobox.toggle")}
            aria-expanded={open}
            aria-controls={listId}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              inputRef.current?.focus();
              if (open) close();
              else openAt(-1);
            }}
          >
            <Icon icon={ChevronDown} size={16} />
          </button>
          <ul
            id={listId}
            role="listbox"
            aria-labelledby={labelId(id)}
            className={s.list}
            hidden={!open}
          >
            {shown.length === 0 && (
              <li className={s.status} role="presentation">
                {t("ui.combobox.empty")}
              </li>
            )}
            {items.map((o, i) => {
              const extra = i >= shown.length;
              return (
                <li
                  key={`${extra ? "x" : "o"}:${o.value}`}
                  id={optId(i)}
                  role="option"
                  aria-selected={i === active}
                  className={cx(s.option, extra && s.extra)}
                  data-active={i === active || undefined}
                  data-current={o.value === value || undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => active !== i && setActive(i)}
                  onClick={() => choose(o)}
                >
                  <span className={s.check} aria-hidden="true">
                    {o.value === value && <Icon icon={Check} size={14} />}
                  </span>
                  <span className={s.optText}>
                    <span className={s.optLabel}>{o.label}</span>
                    {o.description && <span className={s.optDesc}>{o.description}</span>}
                  </span>
                  {o.meta && <span className={s.meta}>{o.meta}</span>}
                </li>
              );
            })}
            {hidden > 0 && (
              <li className={s.status} role="presentation">
                {t("ui.combobox.more", { n: hidden })}
              </li>
            )}
          </ul>
        </div>
      </FieldFrame>
      <div id={noteId} aria-live="polite" className={s.noteSlot}>
        {noteContent}
      </div>
    </div>
  );
}
