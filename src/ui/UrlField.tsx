import { forwardRef, useId, useImperativeHandle, useRef, type ClipboardEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { Link2, LoaderCircle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import s from "./Field.module.css";
import { IconButton } from "./Button";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { describedBy, FieldFrame } from "./TextField";

export interface UrlFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "size"> {
  value: string;
  onValueChange: (value: string) => void;
  /** called with the pasted text after a paste lands in the field */
  onPasteText?: (text: string) => void;
  onClear?: () => void;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** a probe is running for the current link */
  busy?: boolean;
  fieldClassName?: string;
}

/** Large counter field where links are handed over. */
export const UrlField = forwardRef<HTMLInputElement, UrlFieldProps>(function UrlField(
  { id: idProp, value, onValueChange, onPasteText, onClear, label, hint, error, busy, disabled, placeholder, fieldClassName, className, ...rest },
  ref,
) {
  const { t } = useTranslation();
  const autoId = useId();
  const id = idProp ?? autoId;
  const inner = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLInputElement);

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").trim();
    if (!text || !onPasteText) return;
    // replace the whole field with the pasted link, the common case
    e.preventDefault();
    onValueChange(text);
    onPasteText(text);
  };

  const clear = () => {
    onValueChange("");
    onClear?.();
    inner.current?.focus();
  };

  return (
    <FieldFrame id={id} label={label ?? t("ui.urlField.label")} hideLabel={!label} hint={hint} error={error} className={fieldClassName}>
      <div
        className={cx(s.control, s.large, className)}
        data-invalid={error ? "true" : undefined}
        data-disabled={disabled ? "true" : undefined}
      >
        <span className={s.leading}>
          <Icon icon={Link2} size={18} />
        </span>
        <input
          ref={inner}
          id={id}
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className={s.input}
          value={value}
          placeholder={placeholder ?? t("ui.urlField.placeholder")}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-busy={busy || undefined}
          aria-describedby={describedBy(id, hint, error)}
          onChange={(e) => onValueChange(e.target.value)}
          onPaste={handlePaste}
          {...rest}
        />
        <span className={s.trailing}>
          {busy && <Icon icon={LoaderCircle} size={16} className={s.busy} />}
          {value && !disabled && <IconButton icon={X} size="sm" aria-label={t("ui.urlField.clear")} onClick={clear} />}
        </span>
      </div>
    </FieldFrame>
  );
});
