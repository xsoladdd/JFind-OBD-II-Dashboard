"use client";

import { useState } from "react";
import { Button, cx, EmptyState, Field, IconButton, Select, StoppedOnly } from "@/components/ui";
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
import { useDriving } from "@/lib/drive/driving";
import { liveDef, useLive } from "@/lib/store/live";
import { useCustomLayouts, useRedline } from "@/lib/store/settings";
import { Gauge } from "../Gauge";
import { fmt, useDisplay, ZONE_COLOR, ZONE_TEXT, zoneAt, zonesFor } from "../live";
import { Sparkline } from "../Sparkline";

const SPAN: Record<WidgetSize, string> = { "1x1": "", "2x1": "col-span-2", "2x2": "col-span-2 row-span-2" };

function WidgetView({ w }: { w: Widget }) {
  const d = useDisplay(w.pid);
  const [redline] = useRedline();
  const supported = useLive((s) => s.supported.includes(w.pid));
  const zones = zonesFor(w.pid, d, redline);
  const zone = zoneAt(d.value, zones);
  const big = w.size === "2x2";
  if (!supported) return <p className="p-2 text-fg-faint">{d.name}: not supported by this car</p>;
  if (w.kind === "gauge")
    return <Gauge label={d.name} unit={d.unit} value={d.value} min={d.min} max={d.max} zones={zones} tickScale={w.pid === "010C" ? 1000 : 1} />;
  const pct = d.value === undefined ? 0 : Math.max(0, Math.min(100, ((d.value - d.min) / (d.max - d.min)) * 100));
  return (
    <div className="flex h-full flex-col justify-between gap-2 p-1">
      <div className="flex items-baseline justify-between gap-2 text-lg">
        <span className="truncate font-medium text-fg-muted">{d.name}</span>
        {zone && <span className={cx("shrink-0 font-bold", ZONE_TEXT[zone.tone])}>{zone.word}</span>}
      </div>
      <div className={cx("num truncate leading-none", zone ? ZONE_TEXT[zone.tone] : "text-fg", big ? "text-8xl" : w.kind === "number" ? "text-6xl" : "text-4xl")}>
        {fmt(d.value, d.unit)}
        <span className="ml-1.5 font-sans text-xl font-medium text-fg-faint [font-stretch:100%]">{d.unit}</span>
      </div>
      {w.kind === "bar" && (
        <div className="h-5 overflow-hidden rounded-full bg-surface-2" role="meter" aria-label={d.name} aria-valuemin={d.min} aria-valuemax={d.max} aria-valuenow={d.value}>
          <div className="h-full rounded-full transition-[width] duration-100" style={{ width: `${pct}%`, background: zone ? ZONE_COLOR[zone.tone] : "var(--accent)" }} />
        </div>
      )}
      {w.kind === "sparkline" && <Sparkline points={d.live?.history ?? []} color={zone ? ZONE_COLOR[zone.tone] : undefined} />}
    </div>
  );
}

/** Asks for a name and creates a layout (a typed name: parked only, so callers sit inside StoppedOnly). */
function useCreateLayout(onCreated: () => void) {
  const [state, save] = useCustomLayouts();
  return () => {
    const name = prompt("Layout name", `Layout ${state.layouts.length + 1}`);
    if (name?.trim()) {
      save(addLayout(state, name.trim()));
      onCreated();
    }
  };
}

/** Layout management for the dashboard settings sheet (parked only): pick, create, rename, copy, delete, edit. */
export function CustomLayoutControls({ editing, setEditing }: { editing: boolean; setEditing: (on: boolean) => void }) {
  const [state, save] = useCustomLayouts();
  const create = useCreateLayout(() => setEditing(true));
  const layout = activeLayout(state);
  if (!layout)
    return (
      <Button size="drive" className="w-full" onClick={create}>
        New layout
      </Button>
    );
  const id = layout.id;
  return (
    <div className="space-y-3">
      <Field label="Custom layout">
        <Select value={id} onChange={(e) => save(setActive(state, e.currentTarget.value))}>
          {state.layouts.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button size="drive" variant={editing ? "primary" : "secondary"} className="w-full" aria-pressed={editing} onClick={() => setEditing(!editing)}>
        {editing ? "Done editing" : "Edit this layout"}
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={create}>New</Button>
        <Button
          onClick={() => {
            const name = prompt("Rename layout", layout.name);
            if (name?.trim()) save(renameLayout(state, id, name.trim()));
          }}
        >
          Rename
        </Button>
        <Button onClick={() => save(duplicateLayout(state, id, `${layout.name} copy`))}>Duplicate</Button>
        <Button variant="danger" onClick={() => confirm(`Delete layout "${layout.name}"?`) && save(deleteLayout(state, id))}>
          Delete
        </Button>
      </div>
    </div>
  );
}

/** The user's own layout. View mode is only the widgets; editing (started from the settings sheet) is parked only. */
export function Custom({ editing, setEditing }: { editing: boolean; setEditing: (on: boolean) => void }) {
  const [state, save] = useCustomLayouts();
  const supported = useLive((s) => s.supported);
  const driving = useDriving();
  const create = useCreateLayout(() => setEditing(true));
  const [pid, setPid] = useState("");
  const [kind, setKind] = useState<WidgetKind>("gauge");
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const layout = activeLayout(state);

  if (!layout)
    return (
      <StoppedOnly label="Building a layout">
        <EmptyState title="Build your own dashboard" action={<Button variant="primary" onClick={create}>New layout</Button>}>
          Pick the values you want as dials, numbers, bars or sparklines, and arrange them.
        </EmptyState>
      </StoppedOnly>
    );

  const id = layout.id;
  const edit = editing && !driving; // while moving, the widgets stay readable and the editing tools are locked
  const options = supported.filter((p) => liveDef(p) && !liveDef(p)!.text); // status / enum PIDs aren't gauges
  const chosen = options.includes(pid) ? pid : (options[0] ?? "");

  return (
    <div className="h-full space-y-3 overflow-y-auto overscroll-contain">
      {editing && (
        <div>
          <StoppedOnly label="Editing this layout">
            <form
              className="flex flex-wrap items-end gap-2 rounded-panel border border-line bg-surface-1 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (chosen) save(addWidget(state, id, chosen, kind));
              }}
            >
              <Field label="Value" className="min-w-40 flex-1">
                <Select value={chosen} onChange={(e) => setPid(e.currentTarget.value)}>
                  {options.map((p) => (
                    <option key={p} value={p}>
                      {liveDef(p)!.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Widget">
                <Select value={kind} onChange={(e) => setKind(e.currentTarget.value as WidgetKind)}>
                  {KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" variant="primary" disabled={!chosen}>
                Add widget
              </Button>
              <Button onClick={() => setEditing(false)}>Done</Button>
            </form>
          </StoppedOnly>
        </div>
      )}

      {layout.widgets.length === 0 ? (
        <p className="py-10 text-center text-lg text-fg-faint">{edit ? "Add a widget above." : "This layout is empty. Edit it from Menu."}</p>
      ) : (
        <ul className="grid grid-flow-dense auto-rows-[minmax(10rem,auto)] grid-cols-2 gap-3 md:grid-cols-4 short:grid-cols-4">
          {layout.widgets.map((w, i) => (
            <li
              key={w.id}
              draggable={edit}
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => edit && dragFrom !== null && e.preventDefault()}
              onDrop={() => {
                if (dragFrom !== null) save(moveWidget(state, id, dragFrom, i));
                setDragFrom(null);
              }}
              onDragEnd={() => setDragFrom(null)}
              className={cx(
                "flex min-w-0 flex-col rounded-panel border bg-surface-1 p-2",
                SPAN[w.size],
                edit ? "border-dashed border-line-strong" : "border-line",
                dragFrom === i && "opacity-40",
              )}
            >
              {edit && (
                <div className="mb-2 grid gap-1">
                  <Select
                    aria-label={`Widget type for ${liveDef(w.pid)?.name ?? w.pid}`}
                    value={w.kind}
                    onChange={(e) => save(updateWidget(state, id, w.id, { kind: e.currentTarget.value as WidgetKind }))}
                    className="min-h-11"
                  >
                    {KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </Select>
                  <div className="flex flex-wrap gap-1">
                    <IconButton size="sm" label={`Size ${w.size}, change`} onClick={() => save(updateWidget(state, id, w.id, { size: nextSize(w.size) }))}>
                      {w.size.replace("x", "×")}
                    </IconButton>
                    <IconButton size="sm" label="Move up" disabled={i === 0} onClick={() => save(moveWidget(state, id, i, i - 1))}>
                      ↑
                    </IconButton>
                    <IconButton size="sm" label="Move down" disabled={i === layout.widgets.length - 1} onClick={() => save(moveWidget(state, id, i, i + 1))}>
                      ↓
                    </IconButton>
                    <IconButton size="sm" variant="danger" label="Remove widget" onClick={() => save(removeWidget(state, id, w.id))}>
                      ✕
                    </IconButton>
                  </div>
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
