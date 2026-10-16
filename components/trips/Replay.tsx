"use client";

import { useMemo, useState } from "react";
import { LineChart, type Series } from "@/components/dashboard/LineChart";
import { fmt, SERIES } from "@/components/dashboard/live";
import { liveDef } from "@/lib/store/live";
import { useUnits } from "@/lib/store/settings";
import { parseTripCsv, type TripSummary } from "@/lib/trips/format";
import { decimate } from "@/lib/trips/route";
import { toDisplay } from "@/lib/units";
import { RouteMap, type RoutePoint } from "./RouteMap";
import { btn, disp, fmtDuration } from "./ui";

const MAX_POINTS = 800;
const MAIN = ["010D", "010C"];

/** Timeline scrubber over a recorded trip: charts of speed/RPM and other PIDs, values at the cursor, GPS route. */
export function Replay({ summary, csv }: { summary: TripSummary; csv: string }) {
  const [units] = useUnits();
  const data = useMemo(() => parseTripCsv(csv), [csv]);
  const n = data.t.length;
  const [idx, setIdx] = useState(0);
  const others = summary.columns.map((c) => c.id).filter((id) => !MAIN.includes(id) && !liveDef(id)?.text && data.cols[id]?.some((v) => v !== null));
  const [picked, setPicked] = useState<string[]>(() => others.filter((id) => ["0105", "0111"].includes(id)).slice(0, 2));
  const [colourBy, setColourBy] = useState<"010D" | "010C">("010D");

  const keep = useMemo(() => decimate(n, MAX_POINTS), [n]);
  if (n < 2) return <p className="text-sm text-zinc-400">This trip has too few samples to replay.</p>;

  const start = data.t[0]!;
  const end = data.t[n - 1]!;
  const show = (id: string, raw: number | null | undefined) => {
    const unit = liveDef(id)?.unit ?? "";
    return raw === null || raw === undefined ? "—" : `${fmt(toDisplay(raw, unit, units).value, toDisplay(0, unit, units).unit)} ${toDisplay(0, unit, units).unit}`;
  };
  const series = (ids: string[]): Series[] =>
    ids.flatMap((id, slot) => {
      const def = liveDef(id);
      const col = data.cols[id];
      if (!def || !col) return [];
      const points = keep.flatMap((k) => (col[k] === null ? [] : [{ t: data.t[k]!, v: col[k]! }]));
      return [{ id, label: def.name, color: SERIES[slot % SERIES.length]!, points, min: def.min, max: def.max, format: (v) => show(id, v) }];
    });
  const chart = (ids: string[]) => (
    <LineChart
      series={series(ids)}
      now={end}
      windowMs={end - start}
      startLabel="0:00"
      endLabel={fmtDuration(end - start)}
      timeLabel={(t) => fmtDuration(t - start)}
      cursorT={data.t[idx]}
    />
  );
  const legend = (ids: string[]) => (
    <div className="mb-1 flex flex-wrap gap-x-4 text-xs text-zinc-300">
      {ids.map((id, slot) => (
        <span key={id} className="flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ background: SERIES[slot % SERIES.length] }} />
          {liveDef(id)?.name ?? id}
        </span>
      ))}
    </div>
  );

  const lat = data.cols.lat;
  const lon = data.cols.lon;
  const route: RoutePoint[] = lat && lon ? data.t.flatMap((_, i) => (lat[i] !== null && lon[i] !== null ? [{ i, lat: lat[i]!, lon: lon[i]!, value: data.cols[colourBy]?.[i] ?? null }] : [])) : [];
  const cdef = liveDef(colourBy)!;
  const cvals = route.flatMap((p) => (p.value === null ? [] : [p.value]));
  const [cmin, cmax] = cvals.length ? [Math.min(...cvals), Math.max(...cvals)] : [cdef.min, cdef.max];

  return (
    <div className="space-y-4">
      <div>
        <label className="flex items-center gap-3 text-sm">
          <span className="w-16 shrink-0 font-mono tabular-nums">{fmtDuration(data.t[idx]! - start)}</span>
          <input type="range" min={0} max={n - 1} value={idx} onChange={(e) => setIdx(+e.target.value)} className="w-full accent-sky-500" aria-label="Trip timeline" />
        </label>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          {summary.columns.filter((c) => data.cols[c.id]).map((c) => (
            <div key={c.id} className="flex justify-between gap-2 border-b border-zinc-800 py-0.5">
              <dt className="truncate text-zinc-400">{c.name}</dt>
              <dd className="font-mono tabular-nums">{show(c.id, data.cols[c.id]![idx])}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div>
        {legend(MAIN.filter((id) => data.cols[id]))}
        {chart(MAIN.filter((id) => data.cols[id]))}
      </div>

      {others.length > 0 && (
        <div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {others.map((id) => (
              <button
                key={id}
                aria-pressed={picked.includes(id)}
                onClick={() => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-SERIES.length)))}
                className={`rounded-full border px-2.5 py-1 text-xs ${picked.includes(id) ? "border-sky-500 bg-sky-500/15 text-sky-200" : "border-zinc-700 text-zinc-400"}`}
              >
                {liveDef(id)?.name ?? id}
              </button>
            ))}
          </div>
          {picked.length > 0 && (
            <>
              {legend(picked)}
              {chart(picked)}
            </>
          )}
        </div>
      )}

      {summary.gps && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-semibold">Route</h3>
            <span className="ml-auto text-xs text-zinc-400">Colour by</span>
            {(["010D", "010C"] as const).map((id) => (
              <button key={id} className={`${btn} !px-2 !py-1 text-xs ${colourBy === id ? "!border-sky-500 text-sky-200" : ""}`} onClick={() => setColourBy(id)}>
                {id === "010D" ? "Speed" : "RPM"}
              </button>
            ))}
          </div>
          {route.length ? (
            <RouteMap points={route} cursor={idx} min={cmin} max={cmax} legend={[disp(cmin, cdef.unit, units).join(" "), disp(cmax, cdef.unit, units).join(" ")]} />
          ) : (
            <p className="text-sm text-zinc-400">No GPS fixes were recorded on this trip.</p>
          )}
        </div>
      )}
    </div>
  );
}
