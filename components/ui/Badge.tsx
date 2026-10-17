import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export type Tone = "neutral" | "accent" | "ok" | "warn" | "danger";

const TONE: Record<Tone | "count", string> = {
  neutral: "bg-surface-3 text-fg-muted",
  accent: "bg-accent-soft text-accent",
  ok: "bg-accent-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger-fg",
  count: "min-w-5 justify-center bg-danger px-1.5 text-on-danger tabular-nums", // a number that needs action (nav)
};

export const badgeClass = (tone: Tone | "count" = "neutral") =>
  `inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold leading-4 ${TONE[tone]}`;

/** Short status or count. Not interactive: a Badge is never a button. */
export function Badge({ tone, className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone | "count" }) {
  return <span className={cx(badgeClass(tone), className)} {...rest} />;
}
