"use client";

import { useState } from "react";
import { HISTORY_MS } from "@/lib/store/live";

export interface Series {
  id: string;
  label: string;
  color: string;
  points: { t: number; v: number }[];
  /** Raw display range: each series is drawn as % of its own range so they share one axis. */
  min: number;
  max: number;
  format: (raw: number) => string;
}

const W = 600;
const H = 200;

/**
 * Multi-PID chart over the `windowMs` ending at `now` (default: the live 60 s), one shared 0–100 % axis,
 * crosshair + tooltip on hover. Trip replay passes the whole trip as the window, plus a `cursorT` marker.
 */
export function LineChart({
  series,
  now,
  windowMs = HISTORY_MS,
  startLabel = "−60 s",
  endLabel = "now",
  timeLabel = (t: number) => `${((t - now) / 1000).toFixed(1)} s`,
  cursorT,
}: {
  series: Series[];
  now: number;
  windowMs?: number;
  startLabel?: string;
  endLabel?: string;
  timeLabel?: (t: number) => string;
  cursorT?: number;
}) {
  const [hoverT, setHoverT] = useState<number | null>(null);
  const x = (t: number) => ((t - now + windowMs) / windowMs) * W;
  const y = (s: Series, v: number) => H - Math.max(0, Math.min(1, (v - s.min) / (s.max - s.min || 1))) * H;
  const nearest = (s: Series, t: number) =>
    s.points.reduce<Series["points"][number] | undefined>((best, p) => (!best || Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best), undefined);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-48 w-full touch-none rounded-md bg-zinc-950 sm:h-56"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHoverT(now - windowMs + ((e.clientX - r.left) / r.width) * windowMs);
        }}
        onPointerLeave={() => setHoverT(null)}
        role="img"
        aria-label={`Live chart of ${series.map((s) => s.label).join(", ")}`}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="#27272a" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        {series.map((s) => (
          <path
            key={s.id}
            d={s.points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(s, p.v).toFixed(1)}`).join("")}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {cursorT !== undefined && <line x1={x(cursorT)} x2={x(cursorT)} y1="0" y2={H} stroke="#f4f4f5" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
        {hoverT !== null && <line x1={x(hoverT)} x2={x(hoverT)} y1="0" y2={H} stroke="#a1a1aa" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
        <span>{startLabel}</span>
        <span>% of each PID&apos;s range</span>
        <span>{endLabel}</span>
      </div>
      {hoverT !== null && series.length > 0 && (
        <div className="pointer-events-none absolute left-2 top-2 rounded-md border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs shadow-lg">
          <div className="mb-1 text-zinc-400">{timeLabel(hoverT)}</div>
          {series.map((s) => {
            const p = nearest(s, hoverT);
            return (
              <div key={s.id} className="flex items-center gap-2">
                <span className="h-0.5 w-3" style={{ background: s.color }} />
                <span className="text-zinc-300">{s.label}</span>
                <span className="ml-auto font-mono text-zinc-100">{p ? s.format(p.v) : "—"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
