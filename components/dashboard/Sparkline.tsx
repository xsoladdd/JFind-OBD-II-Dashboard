"use client";

import { HISTORY_MS } from "@/lib/store/live";

/** A single-series trend line over the live history window, auto-scaled (no axes: the card shows the value). */
export function Sparkline({ points, color = "var(--accent)" }: { points: { t: number; v: number }[]; color?: string }) {
  if (points.length < 2) return <div className="h-10" />;
  const end = points[points.length - 1]!.t;
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs);
  const span = Math.max(...vs) - min || 1;
  const d = points
    .map((p, i) => `${i ? "L" : "M"}${(((p.t - end + HISTORY_MS) / HISTORY_MS) * 100).toFixed(2)},${(40 - ((p.v - min) / span) * 40).toFixed(2)}`)
    .join("");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-10 w-full" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
