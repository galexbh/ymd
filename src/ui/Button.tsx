import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import s from "./Button.module.css";
import { cx } from "./cx";
import { Icon } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** shows a progress glyph, disables the button and sets aria-busy; the label stays */
  loading?: boolean;
  leadingIcon?: LucideIcon;
  trailingIcon?: LucideIcon;
  children?: ReactNode;
}

const iconSize = (size: ButtonSize) => (size === "sm" ? 14 : size === "lg" ? 18 : 16);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, leadingIcon, trailingIcon, disabled, className, children, type = "button", ...rest },
  ref,
) {
  const lead = loading ? LoaderCircle : leadingIcon;
  return (
    <button
      ref={ref}
      type={type}
      className={cx(s.button, s[variant], size !== "md" && s[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {lead && <Icon icon={lead} size={iconSize(size)} className={loading ? s.spinner : undefined} />}
      {children}
      {trailingIcon && !loading && <Icon icon={trailingIcon} size={iconSize(size)} />}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: LucideIcon;
  /** required: icon-only controls must be named */
  "aria-label": string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, variant = "ghost", size = "md", loading = false, disabled, className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(s.button, s.icon, s[variant], size !== "md" && s[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <Icon icon={loading ? LoaderCircle : icon} size={iconSize(size)} className={loading ? s.spinner : undefined} />
    </button>
  );
});
