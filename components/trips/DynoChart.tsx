"use client";

import { useState } from "react";
import { niceTicks } from "@/lib/dashboard/ticks";

export interface DynoSeries {
  id: string;
  label: string;
  color: string;
  dashed?: boolean;
  points: { rpm: number; v: number }[]; // v already in display units
  peak: { rpm: number; v: number };
}

const W = 600;
const H = 180;

/**
 * One measure (power or torque) against RPM, up to two runs. One y-axis per chart: power and torque get a chart
 * each. Lines are stretched to the box; labels and peak dots are HTML so they don't stretch with it.
 */
export function DynoChart({ title, unit, series, decimals = 0 }: { title: string; unit: string; series: DynoSeries[]; decimals?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.points);
  if (!all.length) return null;
  const rpms = all.map((p) => p.rpm);
  const vals = all.map((p) => p.v);
  const x0 = Math.floor(Math.min(...rpms) / 500) * 500;
  const x1 = Math.ceil(Math.max(...rpms) / 500) * 500;
  const y1 = Math.max(...vals) * 1.08 || 1;
  const yTicks = niceTicks(0, y1, 4);
  const fx = (rpm: number) => (rpm - x0) / (x1 - x0 || 1);
  const fy = (v: number) => 1 - Math.max(0, v) / y1;
  const at = (s: DynoSeries, rpm: number) =>
    s.points.reduce<DynoSeries["points"][number] | undefined>((b, p) => (!b || Math.abs(p.rpm - rpm) < Math.abs(b.rpm - rpm) ? p : b), undefined);

  return (
    <figure className="text-xs">
      <figcaption className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-zinc-200">
          {title} <span className="text-zinc-500">({unit})</span>
        </span>
        {series.length > 1 &&
          series.map((s) => (
            <span key={s.id} className="flex items-center gap-1 text-zinc-400">
              <svg width="16" height="4" aria-hidden>
                <line x1="0" x2="16" y1="2" y2="2" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "4 3" : undefined} />
              </svg>
              {s.label}
            </span>
          ))}
      </figcaption>
      <div className="flex">
        <div className="relative w-10 shrink-0 text-right text-[10px] text-zinc-500" aria-hidden>
          {yTicks.map((v) => (
            <span key={v} className="absolute right-1.5 -translate-y-1/2" style={{ top: `${fy(v) * 100}%` }}>
              {v}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-40 w-full touch-none rounded-md bg-zinc-950 sm:h-48"
            role="img"
            aria-label={`${title} against engine speed: ${series.map((s) => `${s.label} peak ${s.peak.v.toFixed(decimals)} ${unit} at ${Math.round(s.peak.rpm)} rpm`).join("; ")}`}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setHover(x0 + ((e.clientX - r.left) / r.width) * (x1 - x0));
            }}
            onPointerLeave={() => setHover(null)}
          >
            {yTicks.map((v) => (
              <line key={v} x1="0" x2={W} y1={fy(v) * H} y2={fy(v) * H} stroke="#27272a" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            {series.map((s) => (
              <path
                key={s.id}
                d={s.points.map((p, i) => `${i ? "L" : "M"}${(fx(p.rpm) * W).toFixed(1)},${(fy(p.v) * H).toFixed(1)}`).join("")}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeDasharray={s.dashed ? "6 4" : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {hover !== null && <line x1={fx(hover) * W} x2={fx(hover) * W} y1="0" y2={H} stroke="#a1a1aa" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
          </svg>
          {series.map((s) => (
            <span
              key={s.id}
              aria-hidden
              className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-zinc-950"
              style={{ left: `${fx(s.peak.rpm) * 100}%`, top: `${fy(s.peak.v) * 100}%`, background: s.color }}
            />
          ))}
          {hover !== null && (
            <div className="pointer-events-none absolute left-2 top-2 rounded-md border border-zinc-700 bg-zinc-900/95 px-3 py-2 shadow-lg">
              <div className="mb-1 text-zinc-400">{Math.round(hover)} rpm</div>
              {series.map((s) => {
                const p = at(s, hover);
                return (
                  <div key={s.id} className="flex items-center gap-2">
                    <span className="h-0.5 w-3" style={{ background: s.color }} />
                    <span className="text-zinc-300">{s.label}</span>
                    <span className="ml-auto pl-2 font-mono text-zinc-100">{p ? `${p.v.toFixed(decimals)} ${unit}` : "—"}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
            <span>{x0} rpm</span>
            <span>engine speed</span>
            <span>{x1} rpm</span>
          </div>
        </div>
      </div>
    </figure>
  );
}
