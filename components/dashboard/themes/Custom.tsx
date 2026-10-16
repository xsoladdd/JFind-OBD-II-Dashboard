"use client";

import { useState } from "react";
import { COOLANT_HOT_C, FUEL_LOW_PCT } from "@/lib/dashboard/zones";
import {
  activeLayout,
  addLayout,
  addWidget,
  deleteLayout,
  duplicateLayout,
  KINDS,
  moveWidget,
  nextSize,
  removeWidget,
  renameLayout,
  setActive,
  updateWidget,
  type Widget,
  type WidgetKind,
  type WidgetSize,
} from "@/lib/dashboard/layouts";
import { liveDef, useLive } from "@/lib/store/live";
import { useCustomLayouts, useRedline } from "@/lib/store/settings";
import { Gauge, type Zone } from "../Gauge";
import { fmt, useDisplay } from "../live";
import { Sparkline } from "../Sparkline";

const RED = "#e66767";
const AMBER = "#c98500";
const SPAN: Record<WidgetSize, string> = { "1x1": "", "2x1": "col-span-2", "2x2": "col-span-2 row-span-2" };
const btn = "rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-40";
const icon = "rounded-md border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-30";

/** The same warning zones Classic draws (lib/dashboard/zones.ts + the redline setting), in display units. */
function zonesFor(pid: string, d: ReturnType<typeof useDisplay>, redline: number): Zone[] {
  if (pid === "010C") return [{ from: redline, to: d.max, color: RED }];
  if (pid === "0105") return [{ from: d.conv(COOLANT_HOT_C), to: d.max, color: RED }];
  if (pid === "012F") return [{ from: d.min, to: d.conv(FUEL_LOW_PCT), color: AMBER }];
  return [];
}

function WidgetView({ w }: { w: Widget }) {
  const d = useDisplay(w.pid);
  const [redline] = useRedline();
  const supported = useLive((s) => s.supported.includes(w.pid));
  const zones = zonesFor(w.pid, d, redline);
  const warn = d.value !== undefined && zones.some((z) => d.value! >= z.from && d.value! <= z.to);
  const big = w.size === "2x2";
  if (!supported) return <p className="p-3 text-sm text-zinc-500">{d.name}: not supported by this car</p>;
  if (w.kind === "gauge")
    return <Gauge label={d.name} unit={d.unit} value={d.value} min={d.min} max={d.max} zones={zones} tickScale={w.pid === "010C" ? 1000 : 1} />;
  const pct = d.value === undefined ? 0 : Math.max(0, Math.min(100, ((d.value - d.min) / (d.max - d.min)) * 100));
  return (
    <div className="flex h-full flex-col justify-between gap-2 p-1">
      <div className={`truncate text-xs ${warn ? "font-semibold text-red-300" : "text-zinc-500"}`}>
        {d.name}
        {warn && " ⚠"}
      </div>
      <div className={`font-mono font-semibold tabular-nums ${warn ? "text-red-300" : "text-zinc-50"} ${big ? "text-6xl" : w.kind === "number" ? "text-4xl" : "text-2xl"}`}>
        {fmt(d.value, d.unit)}
        <span className="ml-1 text-sm font-normal text-zinc-500">{d.unit}</span>
      </div>
      {w.kind === "bar" && (
        <div className="h-3 overflow-hidden rounded-full bg-zinc-800" role="meter" aria-label={d.name} aria-valuemin={d.min} aria-valuemax={d.max} aria-valuenow={d.value}>
          <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${pct}%`, background: warn ? RED : "#3987e5" }} />
        </div>
      )}
      {w.kind === "sparkline" && <Sparkline points={d.live?.history ?? []} color={warn ? RED : undefined} />}
    </div>
  );
}

export function Custom() {
  const [state, save] = useCustomLayouts();
  const supported = useLive((s) => s.supported);
  const [editing, setEditing] = useState(false);
  const [pid, setPid] = useState("");
  const [kind, setKind] = useState<WidgetKind>("gauge");
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const layout = activeLayout(state);

  const create = () => {
    const name = prompt("Layout name", `Layout ${state.layouts.length + 1}`);
    if (name?.trim()) {
      save(addLayout(state, name.trim()));
      setEditing(true);
    }
  };

  if (!layout)
    return (
      <section className="mx-auto mt-6 max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center">
        <h2 className="text-lg font-semibold">Build your own dashboard</h2>
        <p className="mt-2 text-sm text-zinc-400">Pick the values you want as dials, numbers, bars or sparklines, and arrange them.</p>
        <button onClick={create} className="mt-4 rounded-md bg-sky-600 px-5 py-3 font-semibold hover:bg-sky-500">
          New layout
        </button>
      </section>
    );

  const id = layout.id;
  const options = supported.filter((p) => liveDef(p) && !liveDef(p)!.text); // status / enum PIDs aren't gauges
  const chosen = options.includes(pid) ? pid : (options[0] ?? "");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Layout"
          value={id}
          onChange={(e) => save(setActive(state, e.currentTarget.value))}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm"
        >
          {state.layouts.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        {editing && (
          <>
            <button className={btn} onClick={create}>
              New
            </button>
            <button
              className={btn}
              onClick={() => {
                const name = prompt("Rename layout", layout.name);
                if (name?.trim()) save(renameLayout(state, id, name.trim()));
              }}
            >
              Rename
            </button>
            <button className={btn} onClick={() => save(duplicateLayout(state, id, `${layout.name} copy`))}>
              Duplicate
            </button>
            <button className={`${btn} text-red-300`} onClick={() => confirm(`Delete layout "${layout.name}"?`) && save(deleteLayout(state, id))}>
              Delete
            </button>
          </>
        )}
        <button className={`${btn} ml-auto ${editing ? "bg-sky-600 font-semibold hover:bg-sky-500" : ""}`} onClick={() => setEditing(!editing)} aria-pressed={editing}>
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      {editing && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (chosen) save(addWidget(state, id, chosen, kind));
          }}
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-zinc-400">
            Value
            <select value={chosen} onChange={(e) => setPid(e.currentTarget.value)} className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100">
              {options.map((p) => (
                <option key={p} value={p}>
                  {liveDef(p)!.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Widget
            <select value={kind} onChange={(e) => setKind(e.currentTarget.value as WidgetKind)} className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100">
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!chosen} className="rounded-md bg-sky-600 px-4 py-1.5 text-sm font-semibold hover:bg-sky-500 disabled:opacity-40">
            Add widget
          </button>
        </form>
      )}

      {layout.widgets.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">{editing ? "Add a widget above." : "This layout is empty. Tap Edit to add widgets."}</p>
      ) : (
        <ul className="grid grid-flow-dense auto-rows-[minmax(8.5rem,auto)] grid-cols-2 gap-2 md:grid-cols-4">
          {layout.widgets.map((w, i) => (
            <li
              key={w.id}
              draggable={editing}
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => editing && dragFrom !== null && e.preventDefault()}
              onDrop={() => {
                if (dragFrom !== null) save(moveWidget(state, id, dragFrom, i));
                setDragFrom(null);
              }}
              onDragEnd={() => setDragFrom(null)}
              className={`flex min-w-0 flex-col rounded-xl bg-zinc-900 p-2 ${SPAN[w.size]} ${editing ? "border border-dashed border-zinc-700" : ""} ${dragFrom === i ? "opacity-40" : ""}`}
            >
              {editing && (
                <div className="mb-1 flex flex-wrap items-center gap-1">
                  <select
                    aria-label={`Widget type for ${liveDef(w.pid)?.name ?? w.pid}`}
                    value={w.kind}
                    onChange={(e) => save(updateWidget(state, id, w.id, { kind: e.currentTarget.value as WidgetKind }))}
                    className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-1 py-1 text-xs"
                  >
                    {KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                  <button className={icon} onClick={() => save(updateWidget(state, id, w.id, { size: nextSize(w.size) }))} aria-label={`Size ${w.size}, change`}>
                    {w.size.replace("x", "×")}
                  </button>
                  <button className={icon} disabled={i === 0} onClick={() => save(moveWidget(state, id, i, i - 1))} aria-label="Move up">
                    ↑
                  </button>
                  <button className={icon} disabled={i === layout.widgets.length - 1} onClick={() => save(moveWidget(state, id, i, i + 1))} aria-label="Move down">
                    ↓
                  </button>
                  <button className={`${icon} text-red-300`} onClick={() => save(removeWidget(state, id, w.id))} aria-label="Remove widget">
                    ✕
                  </button>
                </div>
              )}
              <div className="min-h-0 flex-1">
                <WidgetView w={w} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
