"use client";

import { niceTicks } from "@/lib/dashboard/ticks";
import { fmt } from "./live";

export interface Zone {
  from: number;
  to: number;
  color: string;
}

const START = 135; // degrees, 0 = 3 o'clock, clockwise
const SWEEP = 270;

const polar = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [100 + r * Math.cos(a), 100 + r * Math.sin(a)] as const;
};

export function arcPath(r: number, from: number, to: number) {
  const [x1, y1] = polar(r, from);
  const [x2, y2] = polar(r, to);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));


/** Analog needle gauge with warning zones. The needle eases with a CSS transition between readings. */
export function Gauge({
  label,
  unit,
  value,
  min,
  max,
  zones = [],
  ticks = 8,
  tickScale = 1,
}: {
  label: string;
  unit: string;
  value: number | undefined;
  min: number;
  max: number;
  zones?: Zone[];
  ticks?: number;
  /** Divide tick labels by this (RPM shows ×1000). */
  tickScale?: number;
}) {
  const angle = (v: number) => START + clamp01((v - min) / (max - min)) * SWEEP;
  const warn = value !== undefined && zones.some((z) => value >= z.from && value <= z.to);
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox="0 0 200 178" className="w-full max-w-72" role="img" aria-label={`${label}: ${fmt(value, unit)} ${unit}`}>
        <path d={arcPath(84, START, START + SWEEP)} fill="none" stroke="#27272a" strokeWidth="10" strokeLinecap="round" />
        {zones.map((z) => (
          <path key={`${z.from}-${z.to}`} d={arcPath(84, angle(z.from), angle(z.to))} fill="none" stroke={z.color} strokeWidth="10" />
        ))}
        {niceTicks(min / tickScale, max / tickScale, ticks).map((t, i, all) => {
          const v = t * tickScale;
          const a = angle(v);
          const label = all.length <= 9 || i % 2 === 0;
          const [x1, y1] = polar(74, a);
          const [x2, y2] = polar(66, a);
          const [tx, ty] = polar(52, a);
          return (
            <g key={t}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={label ? "#a1a1aa" : "#52525b"} strokeWidth="2" />
              {label && (
                <text x={tx} y={ty} fill="#a1a1aa" fontSize="11" textAnchor="middle" dominantBaseline="middle">
                  {t}
                </text>
              )}
            </g>
          );
        })}
        <g
          style={{ transform: `rotate(${angle(value ?? min)}deg)`, transformOrigin: "100px 100px", transition: "transform 250ms linear" }}
        >
          <line x1="100" y1="100" x2="178" y2="100" stroke={warn ? "#e66767" : "#f4f4f5"} strokeWidth="3" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="100" r="7" fill="#3f3f46" />
        <text x="100" y="152" fill="#fafafa" fontSize="24" fontWeight="700" textAnchor="middle" className="tabular-nums">
          {fmt(value, unit)}
        </text>
        <text x="100" y="170" fill="#a1a1aa" fontSize="11" textAnchor="middle">
          {unit}
        </text>
        {tickScale !== 1 && (
          <text x="100" y="78" fill="#71717a" fontSize="9" textAnchor="middle">
            ×{tickScale}
          </text>
        )}
      </svg>
      <figcaption className={`text-sm ${warn ? "font-semibold text-red-300" : "text-zinc-400"}`}>
        {label}
        {warn && " ⚠"}
      </figcaption>
    </figure>
  );
}
