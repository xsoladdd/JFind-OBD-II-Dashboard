"use client";

import { niceTicks } from "@/lib/dashboard/ticks";
import { fmt, ZONE_COLOR, zoneAt, type Zone } from "./live";

export type { Zone } from "./live";

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

/**
 * Analog needle gauge that scales to fill its box. Zones are a thin ring outside the track; in a zone the needle and
 * value take the zone colour and its word ("High", "Low") appears. The needle eases with a short (100 ms) CSS transition, so it never trails a revving engine.
 */
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
  const zone = zoneAt(value, zones);
  const tone = zone ? ZONE_COLOR[zone.tone] : undefined;
  const all = niceTicks(min / tickScale, max / tickScale, ticks);
  return (
    <svg
      viewBox="0 0 200 216"
      className="block h-full w-full"
      role="img"
      aria-label={`${label}: ${fmt(value, unit)} ${unit}${zone ? `, ${zone.word}` : ""}`}
    >
      <path d={arcPath(80, START, START + SWEEP)} fill="none" stroke="var(--surface-2)" strokeWidth="12" strokeLinecap="round" />
      {zones.map((z) => (
        <path key={`${z.from}-${z.to}`} d={arcPath(93, angle(z.from), angle(z.to))} fill="none" stroke={ZONE_COLOR[z.tone]} strokeWidth="5" />
      ))}
      {all.map((t, i) => {
        const a = angle(t * tickScale);
        const labelled = all.length <= 9 || i % 2 === 0;
        const [x1, y1] = polar(70, a);
        const [x2, y2] = polar(62, a);
        const [tx, ty] = polar(48, a);
        return (
          <g key={t}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={labelled ? "var(--fg-muted)" : "var(--line-strong)"} strokeWidth="2" />
            {labelled && (
              <text x={tx} y={ty} fill="var(--fg-muted)" fontSize="14" textAnchor="middle" dominantBaseline="middle" className="num">
                {t}
              </text>
            )}
          </g>
        );
      })}
      <g style={{ transform: `rotate(${angle(value ?? min)}deg)`, transformOrigin: "100px 100px", transition: "transform 100ms linear" }}>
        <line x1="100" y1="100" x2="176" y2="100" stroke={tone ?? "var(--fg)"} strokeWidth="4" strokeLinecap="round" />
      </g>
      <circle cx="100" cy="100" r="7" fill="var(--surface-3)" />
      {tickScale !== 1 && (
        <text x="100" y="76" fill="var(--fg-faint)" fontSize="13" textAnchor="middle">
          ×{tickScale}
        </text>
      )}
      <text x="100" y="180" fill={tone ?? "var(--fg)"} fontSize="44" textAnchor="middle" className="num">
        {fmt(value, unit)}
      </text>
      <text x="100" y="198" fontSize="15" textAnchor="middle" fill="var(--fg-faint)">
        {unit}
        {zone && (
          <tspan fill={tone} fontWeight="700">
            {" "}
            {zone.word}
          </tspan>
        )}
      </text>
      <text x="100" y="214" fontSize="15" textAnchor="middle" fill="var(--fg-muted)">
        {label}
      </text>
    </svg>
  );
}
