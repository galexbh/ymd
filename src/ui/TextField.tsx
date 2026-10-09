import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { CircleAlert, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import s from "./Field.module.css";
import { cx } from "./cx";
import { Icon } from "./Icon";

export interface FieldFrameProps {
  id: string;
  label: ReactNode;
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}

export const hintId = (id: string) => `${id}-hint`;
export const errorId = (id: string) => `${id}-error`;

/** Label + control + hint/error, shared by every form field. */
export function FieldFrame({
  id,
  label,
  hideLabel,
  hint,
  error,
  optional,
  className,
  children,
}: FieldFrameProps) {
  const { t } = useTranslation();
  return (
    <div className={cx(s.field, className)}>
      <label htmlFor={id} className={hideLabel ? "visually-hidden" : s.label}>
        {label}
        {optional && <span className={s.optional}>({t("common.optional")})</span>}
      </label>
      {children}
      {error ? (
        <p id={errorId(id)} className={s.error}>
          <Icon icon={CircleAlert} size={14} />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={hintId(id)} className={s.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, hint: unknown, error: unknown, extra?: string) {
  return (
    [error ? errorId(id) : hint ? hintId(id) : null, extra].filter(Boolean).join(" ") || undefined
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: ReactNode;
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  leadingIcon?: LucideIcon;
  trailing?: ReactNode;
  /** tabular mono input for paths, codes and numbers */
  mono?: boolean;
  fieldClassName?: string;
  "data-demo-state"?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  {
    id: idProp,
    label,
    hideLabel,
    hint,
    error,
    optional,
    leadingIcon,
    trailing,
    mono,
    disabled,
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
      optional={optional}
      className={fieldClassName}
    >
      <div
        className={cx(s.control, mono && s.mono, className)}
        data-invalid={error ? "true" : undefined}
        data-disabled={disabled ? "true" : undefined}
        data-demo-state={demo}
      >
        {leadingIcon && (
          <span className={s.leading}>
            <Icon icon={leadingIcon} size={16} />
          </span>
        )}
        <input
          ref={ref}
          id={id}
          className={s.input}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          {...rest}
        />
        {trailing && <span className={s.trailing}>{trailing}</span>}
      </div>
    </FieldFrame>
  );
});
