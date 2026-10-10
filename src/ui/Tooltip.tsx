import {
  cloneElement,
  isValidElement,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import s from "./Misc.module.css";
import { cx } from "./cx";

export interface TooltipProps {
  content: ReactNode;
  /** a single focusable element; it receives aria-describedby */
  children: ReactElement<{ "aria-describedby"?: string }>;
  placement?: "top" | "bottom";
  /** "end" for triggers at the end of a row: the tip grows leftwards and stays in view */
  align?: "center" | "end";
  className?: string;
  "data-demo-state"?: string;
}

/**
 * Supplementary hint on hover and keyboard focus. Escape hides it.
 * Never put essential information only in a tooltip.
 */
export function Tooltip({
  content,
  children,
  placement = "top",
  align = "center",
  className,
  "data-demo-state": demo,
}: TooltipProps) {
  const id = useId();
  const [dismissed, setDismissed] = useState(false);
  const trigger = isValidElement(children)
    ? cloneElement(children, {
        "aria-describedby": [children.props["aria-describedby"], id].filter(Boolean).join(" "),
      })
    : children;
  return (
    <span
      className={cx(s.tipWrap, className)}
      data-dismissed={dismissed || undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape") setDismissed(true);
      }}
      onMouseLeave={() => setDismissed(false)}
      onBlur={() => setDismissed(false)}
    >
      {trigger}
      <span
        role="tooltip"
        id={id}
        className={cx(s.tip, placement === "bottom" && s.tipBottom, align === "end" && s.tipEnd)}
        data-demo-state={demo}
      >
        {content}
      </span>
    </span>
  );
}
