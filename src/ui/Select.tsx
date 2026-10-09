import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import s from "./Field.module.css";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { describedBy, FieldFrame } from "./TextField";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label: ReactNode;
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  options?: SelectOption[];
  mono?: boolean;
  /** "lg" matches the counter strip's URL field */
  size?: "md" | "lg";
  fieldClassName?: string;
  "data-demo-state"?: string;
}

/** Native select with the field styling; the OS list stays the OS list. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    id: idProp,
    label,
    hideLabel,
    hint,
    error,
    options,
    mono,
    size = "md",
    disabled,
    children,
    fieldClassName,
    className,
    "data-demo-state": demo,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldFrame
      id={id}
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      className={fieldClassName}
    >
      <div
        className={cx(s.control, mono && s.mono, size === "lg" && s.largeSelect, className)}
        data-invalid={error ? "true" : undefined}
        data-disabled={disabled ? "true" : undefined}
        data-demo-state={demo}
      >
        <select
          ref={ref}
          id={id}
          className={cx(s.input, s.select)}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          {...rest}
        >
          {options?.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
          {children}
        </select>
        <Icon icon={ChevronDown} size={16} className={s.chevron} />
      </div>
    </FieldFrame>
  );
});
