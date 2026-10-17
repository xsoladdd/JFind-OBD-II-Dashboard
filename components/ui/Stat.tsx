import type { ReactNode } from "react";
import { cx } from "./cx";
import type { Tone } from "./Badge";

const SIZE = { md: "text-3xl", lg: "text-5xl", xl: "text-7xl" } as const;
const TONE: Partial<Record<Tone, string>> = { accent: "text-accent", ok: "text-ok", warn: "text-warn", danger: "text-danger" };

/** Shown when there is no value yet. Two hyphens, like a car's own display. */
export const NO_VALUE = "--";

/** A big tabular number with its unit and label: the glanceable readout. */
export function Stat({
  label,
  value,
  unit,
  note,
  tone,
  size = "md",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  note?: ReactNode;
  tone?: Tone;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={cx("min-w-0", className)}>
      <div className="text-sm text-fg-muted">{label}</div>
      <div className={cx("num mt-1 leading-none", SIZE[size], !empty && tone && TONE[tone])}>
        {empty ? NO_VALUE : value}
        {unit && <span className="ml-1 font-sans text-[max(0.875rem,0.4em)] font-medium text-fg-faint [font-stretch:100%]">{unit}</span>}
      </div>
      {note && <div className="mt-1.5 text-sm text-fg-faint">{note}</div>}
    </div>
  );
}
