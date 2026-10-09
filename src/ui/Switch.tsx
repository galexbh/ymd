import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useImperativeHandle,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import s from "./Choice.module.css";
import { cx } from "./cx";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
  "data-demo-state"?: string;
}

/** On/off setting that applies immediately. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  id: idProp,
  className,
  "data-demo-state": demo,
}: SwitchProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <label
      className={cx(s.toggleRow, className)}
      data-disabled={disabled ? "true" : undefined}
      htmlFor={id}
    >
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        className={s.switch}
        data-demo-state={demo}
        onClick={() => onChange(!checked)}
      />
      <span className={s.toggleText}>
        <span>{label}</span>
        {description && (
          <span id={`${id}-desc`} className={s.toggleDesc}>
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange"
> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  indeterminate?: boolean;
  invalid?: boolean;
  "data-demo-state"?: string;
}

/** Native checkbox, restyled; part of a set of choices or a list selection. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    checked,
    onCheckedChange,
    label,
    description,
    indeterminate = false,
    invalid,
    disabled,
    id: idProp,
    className,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const inner = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLInputElement);
  useEffect(() => {
    if (inner.current) inner.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label
      className={cx(s.toggleRow, className)}
      data-disabled={disabled ? "true" : undefined}
      htmlFor={id}
    >
      <input
        ref={inner}
        id={id}
        type="checkbox"
        className={s.checkbox}
        checked={checked}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={description ? `${id}-desc` : undefined}
        onChange={(e) => onCheckedChange(e.target.checked)}
        {...rest}
      />
      <span className={s.toggleText}>
        <span>{label}</span>
        {description && (
          <span id={`${id}-desc`} className={s.toggleDesc}>
            {description}
          </span>
        )}
      </span>
    </label>
  );
});
