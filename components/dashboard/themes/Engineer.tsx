"use client";

import { useState } from "react";
import { startRecording, toCsv } from "@/lib/dashboard/recorder";
import { liveDef, useLive } from "@/lib/store/live";
import { useUnits } from "@/lib/store/settings";
import { toDisplay } from "@/lib/units";
import { LineChart, type Series } from "../LineChart";
import { fmt, SERIES } from "../live";

const MAX_SERIES = SERIES.length;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function Engineer() {
  const { supported, values } = useLive();
  const [units] = useUnits();
  // id → palette slot; a series keeps its colour while shown.
  const [shown, setShown] = useState<Record<string, number>>({ "010C": 0, "010D": 1, "0111": 2 });
  const [rec, setRec] = useState<ReturnType<typeof startRecording> | null>(null);

  const toggle = (id: string) =>
    setShown((s) => {
      if (id in s) return Object.fromEntries(Object.entries(s).filter(([k]) => k !== id));
      const free = [...Array(MAX_SERIES).keys()].find((i) => !Object.values(s).includes(i));
      return free === undefined ? s : { ...s, [id]: free };
    });

  const record = () => {
    if (!rec) return setRec(startRecording());
    const rows = rec.stop();
    setRec(null);
    download(`obd-dash-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`, toCsv(rows));
  };

  const show = (id: string, raw: number | undefined) => {
    const unit = liveDef(id)?.unit ?? "";
    return raw === undefined ? "—" : fmt(toDisplay(raw, unit, units).value, unit);
  };
  const unitOf = (id: string) => toDisplay(0, liveDef(id)?.unit ?? "", units).unit;
  const now = Math.max(0, ...Object.values(values).map((v) => v.t));
  const series: Series[] = Object.entries(shown).flatMap(([id, slot]) => {
    const def = liveDef(id);
    if (!def) return [];
    return [{ id, label: def.name, color: SERIES[slot]!, points: values[id]?.history ?? [], min: def.min, max: def.max, format: (v) => `${show(id, v)} ${unitOf(id)}` }];
  });

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {series.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5 text-zinc-300">
              <span className="h-0.5 w-4" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
          {!series.length && <span className="text-zinc-500">Tick up to {MAX_SERIES} PIDs in the table to chart them.</span>}
          <button
            onClick={record}
            className={`ml-auto rounded-md px-3 py-1.5 text-sm font-semibold ${rec ? "bg-red-600 text-white" : "border border-zinc-600 hover:bg-zinc-800"}`}
          >
            {rec ? `■ Stop & save CSV (${rec.count})` : "● Record"}
          </button>
        </div>
        <LineChart series={series} now={now} />
      </section>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="w-8 px-2 py-2" aria-label="Chart" />
              <th className="hidden px-2 py-2 sm:table-cell">PID</th>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2 text-right">Live</th>
              <th className="px-2 py-2 text-right">Min</th>
              <th className="px-2 py-2 text-right">Max</th>
              <th className="px-2 py-2 text-right">Avg</th>
              <th className="hidden px-2 py-2 sm:table-cell">Unit</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {supported.map((id) => {
              const v = values[id];
              const def = liveDef(id);
              const slot = shown[id];
              return (
                <tr key={id} className="border-t border-zinc-800/70 odd:bg-zinc-950 even:bg-zinc-900/40">
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={slot !== undefined}
                      onChange={() => toggle(id)}
                      disabled={slot === undefined && Object.keys(shown).length >= MAX_SERIES}
                      aria-label={`Chart ${def?.name ?? id}`}
                      style={slot !== undefined ? { accentColor: SERIES[slot] } : undefined}
                    />
                  </td>
                  <td className="hidden px-2 py-1.5 text-zinc-500 sm:table-cell">{id}</td>
                  <td className="px-2 py-1.5 font-sans text-zinc-200">
                    {def?.name ?? id}
                    <span className="block text-[11px] text-zinc-500 sm:hidden">
                      {id} · {unitOf(id)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right text-zinc-50">{show(id, v?.value)}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-400">{show(id, v?.min)}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-400">{show(id, v?.max)}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-400">{show(id, v && v.sum / v.count)}</td>
                  <td className="hidden px-2 py-1.5 font-sans text-zinc-500 sm:table-cell">{unitOf(id)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
