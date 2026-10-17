"use client";

import { useRef, type ReactNode } from "react";
import { cx } from "./cx";

/** Roving focus for a radio group: the index a key moves to, or null for keys it ignores. */
export function nextIndex(i: number, key: string, n: number): number | null {
  if (key === "ArrowRight" || key === "ArrowDown") return (i + 1) % n;
  if (key === "ArrowLeft" || key === "ArrowUp") return (i - 1 + n) % n;
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  return null;
}

/**
 * Pick one of a few options (theme, units, period). Arrow keys move and select, like native radios. `size="drive"`
 * wraps into a grid of 72px choices for the drive view (DESIGN.md "Driving") instead of scrolling sideways.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
  className,
}: {
  label: string;
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  size?: "md" | "drive";
  className?: string;
}) {
  const drive = size === "drive";
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = options.findIndex((o) => o.value === value);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        "max-w-full rounded-control border border-line bg-surface-1 p-1",
        drive ? "grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1" : "flex overflow-x-auto",
        className,
      )}
    >
      {options.map((o, i) => {
        const on = i === selected;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (selected < 0 && i === 0) ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const n = nextIndex(i, e.key, options.length);
              if (n === null) return;
              e.preventDefault();
              onChange(options[n]!.value);
              refs.current[n]?.focus();
            }}
            className={cx(
              "flex shrink-0 items-center rounded-[6px] px-4 font-semibold transition-colors duration-150",
              drive ? "min-h-18 justify-center text-lg" : "min-h-11 text-sm",
              on ? "bg-surface-3 text-fg" : "text-fg-faint hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
