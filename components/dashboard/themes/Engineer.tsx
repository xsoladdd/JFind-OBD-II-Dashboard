"use client";

import { useState } from "react";
import { Button, NO_VALUE, panelClass } from "@/components/ui";
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
    return raw === undefined ? NO_VALUE : fmt(toDisplay(raw, unit, units).value, unit);
  };
  const unitOf = (id: string) => toDisplay(0, liveDef(id)?.unit ?? "", units).unit;
  const now = Math.max(0, ...Object.values(values).map((v) => v.t));
  const series: Series[] = Object.entries(shown).flatMap(([id, slot]) => {
    const def = liveDef(id);
    if (!def) return [];
    return [{ id, label: def.name, color: SERIES[slot]!, points: values[id]?.history ?? [], min: def.min, max: def.max, format: (v) => `${show(id, v)} ${unitOf(id)}` }];
  });

  return (
    <div className="h-full space-y-4 overflow-y-auto overscroll-contain">
      <section className={`${panelClass} p-3 sm:p-4`}>
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {series.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5 text-fg-muted">
              <span className="h-0.5 w-4" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
          {!series.length && <span className="text-fg-faint">Tick up to {MAX_SERIES} PIDs in the table to chart them.</span>}
          <Button size="sm" variant={rec ? "danger" : "secondary"} className="ml-auto" onClick={record}>
            {rec ? `Stop and save CSV (${rec.count})` : "Record"}
          </Button>
        </div>
        <LineChart series={series} now={now} />
      </section>

      <div className="overflow-x-auto rounded-panel border border-line">
        <table className="w-full text-sm sm:text-base">
          <thead className="bg-surface-1 text-left text-sm text-fg-faint">
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
          <tbody className="num font-medium">
            {supported.map((id) => {
              const v = values[id];
              const def = liveDef(id);
              const slot = shown[id];
              return (
                <tr key={id} className="border-t border-line even:bg-surface-1/50">
                  <td className="px-2 py-1.5">
                    <input
                      className="size-5"
                      type="checkbox"
                      checked={slot !== undefined}
                      onChange={() => toggle(id)}
                      disabled={!!def?.text || (slot === undefined && Object.keys(shown).length >= MAX_SERIES)}
                      aria-label={`Chart ${def?.name ?? id}`}
                      style={slot !== undefined ? { accentColor: SERIES[slot] } : undefined}
                    />
                  </td>
                  <td className="hidden px-2 py-1.5 text-fg-faint sm:table-cell">{id}</td>
                  <td className="px-2 py-1.5 font-sans font-normal text-fg [font-stretch:100%]">
                    {def?.name ?? id}
                    <span className="block text-[13px] text-fg-faint sm:hidden">
                      {id} · {unitOf(id)}
                    </span>
                  </td>
                  {def?.text ? (
                    // Enum / status PIDs: text across the stats columns; min, max and average of a code mean nothing.
                    <td colSpan={4} className="px-2 py-1.5 text-right font-sans text-fg [font-stretch:100%]">{v ? def.text(v.value) : NO_VALUE}</td>
                  ) : (
                    <>
                      <td className="px-2 py-1.5 text-right text-fg">{show(id, v?.value)}</td>
                      <td className="px-2 py-1.5 text-right text-fg-muted">{show(id, v?.min)}</td>
                      <td className="px-2 py-1.5 text-right text-fg-muted">{show(id, v?.max)}</td>
                      <td className="px-2 py-1.5 text-right text-fg-muted">{show(id, v && v.sum / v.count)}</td>
                    </>
                  )}
                  <td className="hidden px-2 py-1.5 font-sans font-normal text-fg-faint [font-stretch:100%] sm:table-cell">{unitOf(id)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
