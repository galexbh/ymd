import type { LucideIcon, LucideProps } from "lucide-react";

/** One stroke weight for every icon in the app. */
export const ICON_STROKE = 1.75;

export interface IconProps extends Omit<LucideProps, "ref"> {
  icon: LucideIcon;
  size?: number;
}

/** Decorative lucide icon with the shared stroke; label the parent control instead. */
export function Icon({ icon: Glyph, size = 16, ...rest }: IconProps) {
  return <Glyph size={size} strokeWidth={ICON_STROKE} aria-hidden="true" focusable="false" {...rest} />;
}
