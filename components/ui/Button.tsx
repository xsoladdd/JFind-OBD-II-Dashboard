import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-semibold transition-[background-color,color,translate] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-40 aria-busy:cursor-progress";
const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "border border-line-strong bg-surface-2 text-fg hover:bg-surface-3",
  ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
  danger: "border border-danger/50 bg-danger-soft text-danger-fg hover:bg-danger hover:text-on-danger",
};
// Both sizes clear the 44px touch target; md is the default in a car.
const SIZE: Record<ButtonSize, string> = { md: "min-h-12 px-5 text-base", sm: "min-h-11 px-4 text-sm" };

/** Class string for anything that should look like a button (a Link, a file-input label). */
export const buttonClass = (variant: ButtonVariant = "secondary", size: ButtonSize = "md") =>
  `${BASE} ${VARIANT[variant]} ${SIZE[size]}`;

/** Inline text link in running copy. */
export const linkClass = "font-semibold text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Disables the button and marks it busy while an action runs. */
  loading?: boolean;
}

/** type defaults to "button": pass type="submit" inside forms. */
export function Button({ variant, size, loading, disabled, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(buttonClass(variant, size), className)}
      {...rest}
    >
      {children}
      {loading && (
        <span aria-hidden className="animate-pulse">
          …
        </span>
      )}
    </button>
  );
}

/** Square button for a single glyph. The label is required: it is the accessible name and the tooltip. */
export function IconButton({ label, variant = "ghost", size, className, ...rest }: Omit<ButtonProps, "aria-label"> & { label: string }) {
  return (
    <Button
      variant={variant}
      size={size}
      aria-label={label}
      title={label}
      className={cx(size === "sm" ? "min-w-11 px-0" : "min-w-12 px-0", className)}
      {...rest}
    />
  );
}
