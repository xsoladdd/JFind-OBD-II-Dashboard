"use client";

import { useMemo } from "react";
import { useUnits } from "@/lib/store/settings";
import { decimate, fitRoute, RAMP, rampColor } from "@/lib/trips/route";

const W = 400;
const H = 300;
const PAD = 16;

export interface RoutePoint {
  i: number; // row index in the trip data
  lat: number;
  lon: number;
  value: number | null; // colour-by value (raw units)
}

/** The GPS route on a blank canvas (no map tiles, no network), coloured by `value`, with a scale bar. */
export function RouteMap({ points, cursor, min, max, legend }: { points: RoutePoint[]; cursor: number; min: number; max: number; legend: [string, string] }) {
  const [units] = useUnits();
  const pts = useMemo(() => decimate(points.length, 1500).map((k) => points[k]!), [points]);
  const fit = useMemo(() => fitRoute(pts, W, H, PAD, units), [pts, units]);
  // The cursor dot sits on the last fix at or before the scrubbed row.
  let c = -1;
  for (let k = 0; k < pts.length && pts[k]!.i <= cursor; k++) c = k;

  return (
    <div className="mx-auto max-w-xl">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-control bg-bg" role="img" aria-label="Route of the trip, drawn from GPS fixes">
        {fit.xy.slice(1).map(([x, y], k) => {
          const [x0, y0] = fit.xy[k]!;
          const v = pts[k]!.value;
          return <line key={k} x1={x0} y1={y0} x2={x} y2={y} stroke={v === null ? "var(--line-strong)" : rampColor(v, min, max)} strokeWidth="3" strokeLinecap="round" />;
        })}
        {fit.xy[0] && <circle cx={fit.xy[0][0]} cy={fit.xy[0][1]} r="5" fill="var(--fg)" stroke="var(--bg)" strokeWidth="2"><title>Start</title></circle>}
        {c >= 0 && <circle cx={fit.xy[c]![0]} cy={fit.xy[c]![1]} r="7" fill="none" stroke="var(--fg)" strokeWidth="2.5" />}
        <g transform={`translate(${PAD},${H - PAD})`}>
          <line x1="0" x2={fit.bar.px} y1="0" y2="0" stroke="var(--fg-muted)" strokeWidth="2" />
          <line x1="0" x2="0" y1="-4" y2="4" stroke="var(--fg-muted)" strokeWidth="2" />
          <line x1={fit.bar.px} x2={fit.bar.px} y1="-4" y2="4" stroke="var(--fg-muted)" strokeWidth="2" />
          <text x={fit.bar.px / 2} y="-7" textAnchor="middle" fontSize="13" fill="var(--fg-muted)">{fit.bar.label}</text>
        </g>
        <text x={W - PAD} y={PAD + 4} textAnchor="end" fontSize="13" fill="var(--fg-faint)">N ↑</text>
      </svg>
      <div className="num mt-1 flex items-center gap-2 text-[13px] text-fg-muted">
        <span>{legend[0]}</span>
        <span className="flex h-1.5 flex-1 overflow-hidden rounded-full">
          {RAMP.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}
        </span>
        <span>{legend[1]}</span>
      </div>
    </div>
  );
}
