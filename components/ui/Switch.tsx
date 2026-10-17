"use client";

import type { ReactNode } from "react";
import { cx } from "./cx";

/** On/off setting. The whole row is the 48px target; the label and description are its accessible name. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx("flex min-h-12 w-full items-center justify-between gap-4 rounded-control text-left disabled:opacity-40", className)}
    >
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {description && <span className="block text-sm text-fg-faint">{description}</span>}
      </span>
      <span
        aria-hidden
        className={cx(
          "relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-150",
          checked ? "border-accent bg-accent" : "border-line-strong bg-surface-2",
        )}
      >
        <span
          className={cx(
            "absolute top-[2px] left-[2px] size-[22px] rounded-full transition-[translate,background-color] duration-150",
            checked ? "translate-x-5 bg-on-accent" : "bg-fg-muted",
          )}
        />
      </span>
    </button>
  );
}
