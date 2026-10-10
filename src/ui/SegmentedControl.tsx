import { useRef, type KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import s from "./Choice.module.css";
import { cx } from "./cx";
import { Icon } from "./Icon";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** accessible name of the group */
  label: string;
  size?: "md" | "lg";
  disabled?: boolean;
  className?: string;
}

/** Radio group drawn as joined segments; arrows move and select, like native radios. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
  disabled,
  className,
}: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((o, i) => (!o.disabled && !disabled ? i : -1)).filter((i) => i >= 0);

  const move = (from: number, step: number) => {
    if (!enabled.length) return;
    const pos = enabled.indexOf(from);
    const next = enabled[(pos + step + enabled.length) % enabled.length];
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        move(i, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        move(i, -1);
        break;
      case "Home":
        e.preventDefault();
        move(enabled[0], 0);
        break;
      case "End":
        e.preventDefault();
        move(enabled[enabled.length - 1], 0);
        break;
    }
  };

  const selectedIndex = options.findIndex((o) => o.value === value);
  const tabStop =
    selectedIndex >= 0 && enabled.includes(selectedIndex) ? selectedIndex : enabled[0];

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={cx(s.segmented, size === "lg" && s.lg, className)}
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={i === tabStop ? 0 : -1}
          disabled={disabled || o.disabled}
          className={s.segment}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {o.icon && <Icon icon={o.icon} size={16} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}
