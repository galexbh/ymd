import type { HTMLAttributes } from "react";
import s from "./Misc.module.css";
import { cx } from "./cx";

export function Kbd({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <kbd className={cx(s.kbd, className)} {...rest} />;
}
