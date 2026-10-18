"use client";

import { useState, type PointerEvent } from "react";
import { Button, cx, EmptyState, Field, NO_VALUE, SegmentedControl, Select, StoppedOnly } from "@/components/ui";
import {
  activeLayout,
  addLayout,
  addWidget,
  deleteLayout,
  duplicateLayout,
  isFull,
  isTall,
  KINDS,
  moveWidget,
  removeWidget,
  renameLayout,
  setActive,
  sizeOf,
  updateWidget,
  type Widget,
  type WidgetKind,
  type WidgetSize,
} from "@/lib/dashboard/layouts";
import { useDriving } from "@/lib/drive/driving";
import { gearText } from "@/lib/obd/pids";
import { useGearLearning } from "@/lib/store/gear";
import { GEAR, liveDef, useLive } from "@/lib/store/live";
import { useCustomLayouts, useRedline } from "@/lib/store/settings";
import { Gauge } from "../Gauge";
import { fmt, shortName, useDisplay, useLiveValue, ZONE_COLOR, ZONE_TEXT, zoneAt, zonesFor } from "../live";
import { Sparkline } from "../Sparkline";

// Two columns in a narrow pane (portrait phone, every split-screen pane), four from 40rem: "Full" spans two.
// Rows are a third of the pane's height in two columns (half in four), so a small split-screen pane still shows
// several tiles and the starter layout fits a phone without scrolling.
const SPAN: Record<WidgetSize, string> = { "1x1": "", "2x1": "col-span-2", "1x2": "row-span-2", "2x2": "col-span-2 row-span-2" };

/** The gear: from PID 01A4 when the car reports it, otherwise estimated (lib/store/gear.ts) and labelled so. */
function GearView({ w }: { w: Widget }) {
  const v = useLiveValue(GEAR.id);
  const reported = useLive((s) => s.supported.includes("01A4"));
  const [learned] = useGearLearning();
  return (
    <div className="flex h-full flex-col justify-between gap-2 p-1">
      <span className="truncate text-lg font-medium text-fg-muted">Gear</span>
      <div className="flex flex-wrap items-baseline gap-x-2 leading-none">
        <span className={cx("num text-fg", w.size === "2x2" ? "text-6xl @[16rem]:text-8xl" : "text-5xl @[13rem]:text-6xl")}>
          {v ? gearText(v.value) : NO_VALUE}
        </span>
        {!reported && <span className="text-lg text-fg-faint">{learned < 2 ? "learning" : "est."}</span>}
      </div>
    </div>
  );
}

function WidgetView({ w }: { w: Widget }) {
  const d = useDisplay(w.pid);
  const [redline] = useRedline();
  const supported = useLive((s) => s.supported.includes(w.pid));
  const zones = zonesFor(w.pid, d, redline);
  const zone = zoneAt(d.value, zones);
  const name = shortName(w.pid, d.name);
  if (!supported) return <p className="p-1 text-lg text-fg-faint">{name}: not reported by this car</p>;
  if (w.pid === GEAR.id) return <GearView w={w} />;
  if (w.kind === "gauge")
    return (
      // Out of flow, so the dial fits the tile's row height instead of growing the row from its width.
      <div className="relative h-full min-h-20">
        <div className="absolute inset-0">
          <Gauge label={name} unit={d.unit} value={d.value} min={d.min} max={d.max} zones={zones} tickScale={w.pid === "010C" ? 1000 : 1} />
        </div>
      </div>
    );
  const pct = d.value === undefined ? 0 : Math.max(0, Math.min(100, ((d.value - d.min) / (d.max - d.min)) * 100));
  const size = w.size === "2x2" ? "text-5xl @[16rem]:text-8xl" : w.kind === "number" ? "text-4xl @[9rem]:text-5xl @[13rem]:text-6xl @[20rem]:text-8xl" : "text-3xl @[13rem]:text-4xl @[20rem]:text-6xl";
  return (
    <div className="flex h-full flex-col justify-between gap-2 p-1">
      <div className="flex items-baseline justify-between gap-2 text-lg">
        <span className="truncate font-medium text-fg-muted" title={d.name}>
          {name}
        </span>
        {zone && <span className={cx("shrink-0 font-bold", ZONE_TEXT[zone.tone])}>{zone.word}</span>}
      </div>
      {/* The unit wraps under the number in a narrow tile instead of truncating it. */}
      <div className={cx("flex flex-wrap items-baseline gap-x-1.5 leading-none", zone ? ZONE_TEXT[zone.tone] : "text-fg")}>
        <span className={cx("num", size)}>{fmt(d.value, d.unit)}</span>
        <span className="text-xl font-medium text-fg-faint">{d.unit}</span>
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
      <GearLearning />
    </div>
  );
}

/** How many gears the estimate knows for this car, and a way to start over (e.g. after a wrong numbering). */
function GearLearning() {
  const [learned, reset] = useGearLearning();
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-fg-muted">Gear estimate: {learned < 2 ? "learning" : `${learned} gears learned`}</p>
      <Button onClick={() => confirm("Forget the learned gears for this car?") && reset()}>Reset</Button>
    </div>
  );
}

/** Changes one tile: kind, half or full width, normal or tall, position (the keyboard alternative to dragging). */
function TileEditor({
  w,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  w: Widget;
  index: number;
  count: number;
  onChange: (patch: Partial<Omit<Widget, "id">>) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const full = isFull(w.size);
  const tall = isTall(w.size);
  const name = liveDef(w.pid)?.name ?? w.pid;
  const segments = "[&>button]:flex-1 [&>button]:justify-center [&>button]:px-2";
  return (
    <section aria-label={`Tile: ${name}`} className="grid gap-3 border-t border-line pt-3">
      <p className="text-lg font-semibold">{name}</p>
      {w.pid !== GEAR.id && (
        <Field label="Widget">
          <Select value={w.kind} onChange={(e) => onChange({ kind: e.currentTarget.value as WidgetKind })}>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium text-fg-muted">Width</span>
          <SegmentedControl
            label="Width"
            className={segments}
            options={[
              { value: "half", label: "Half" },
              { value: "full", label: "Full" },
            ]}
            value={full ? "full" : "half"}
            onChange={(v) => onChange({ size: sizeOf(v === "full", tall) })}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium text-fg-muted">Height</span>
          <SegmentedControl
            label="Height"
            className={segments}
            options={[
              { value: "normal", label: "Normal" },
              { value: "tall", label: "Tall" },
            ]}
            value={tall ? "tall" : "normal"}
            onChange={(v) => onChange({ size: sizeOf(full, v === "tall") })}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button disabled={index === 0} onClick={() => onMove(index - 1)}>
          Move up
        </Button>
        <Button disabled={index === count - 1} onClick={() => onMove(index + 1)}>
          Move down
        </Button>
        <Button variant="danger" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </section>
  );
}

/** The tile under a pointer, from the data-tile index on each grid cell. */
function tileAt(x: number, y: number) {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-tile]");
  return el ? Number(el.dataset.tile) : null;
}

/** The user's own layout. View mode is only the widgets; editing (started from the settings sheet) is parked only. */
export function Custom({ editing, setEditing }: { editing: boolean; setEditing: (on: boolean) => void }) {
  const [state, save] = useCustomLayouts();
  const supported = useLive((s) => s.supported);
  const driving = useDriving();
  const create = useCreateLayout(() => setEditing(true));
  const [pid, setPid] = useState("");
  const [kind, setKind] = useState<WidgetKind>("gauge");
  const [selected, setSelected] = useState("");
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
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
  // Status / enum PIDs aren't gauges; the gear is the one text value with its own tile.
  const options = supported.filter((p) => liveDef(p) && (!liveDef(p)!.text || p === GEAR.id));
  const chosen = options.includes(pid) ? pid : (options[0] ?? "");
  const index = layout.widgets.findIndex((w) => w.id === selected);
  const sel = layout.widgets[index];

  // Pointer events, not HTML5 drag-and-drop, which never fires for touch on Android.
  // shortcut: no auto-scroll while dragging; a long layout in a small pane uses Move up/down. Add it if users ask.
  const grip = (i: number) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ from: i, over: i });
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const over = drag && tileAt(e.clientX, e.clientY);
      if (drag && over !== null && over !== drag.over) setDrag({ ...drag, over });
    },
    onPointerUp: () => {
      if (drag && drag.from !== drag.over) save(moveWidget(state, id, drag.from, drag.over));
      setDrag(null);
    },
    onPointerCancel: () => setDrag(null),
  });

  return (
    <div className="h-full space-y-3 overflow-y-auto overscroll-contain [container-type:size]">
      {editing && (
        <div>
          <StoppedOnly label="Editing this layout">
            <div className="space-y-3 rounded-panel border border-line bg-surface-1 p-3">
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (chosen) save(addWidget(state, id, chosen, chosen === GEAR.id ? "number" : kind));
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
                <Field label="Widget" className="min-w-32 flex-1">
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
              {sel ? (
                <TileEditor
                  w={sel}
                  index={index}
                  count={layout.widgets.length}
                  onChange={(patch) => save(updateWidget(state, id, sel.id, patch))}
                  onMove={(to) => save(moveWidget(state, id, index, to))}
                  onRemove={() => {
                    save(removeWidget(state, id, sel.id));
                    setSelected("");
                  }}
                />
              ) : (
                layout.widgets.length > 0 && <p className="text-fg-muted">Tap a tile to change it. Drag ⠿ to move it.</p>
              )}
            </div>
          </StoppedOnly>
        </div>
      )}

      {layout.widgets.length === 0 ? (
        <p className="py-10 text-center text-lg text-fg-faint">{edit ? "Add a widget above." : "This layout is empty. Edit it from Menu."}</p>
      ) : (
        <ul className="grid grid-flow-dense auto-rows-[minmax(clamp(5.5rem,calc((100cqh_-_1.5rem)/3),10.5rem),auto)] @[40rem]:auto-rows-[minmax(clamp(5.5rem,calc((100cqh_-_0.75rem)/2),22rem),auto)] grid-cols-2 gap-3 @[40rem]:grid-cols-4">
          {layout.widgets.map((w, i) => (
            <li
              key={w.id}
              data-tile={i}
              className={cx(
                "@container relative flex min-w-0 flex-col overflow-hidden rounded-panel border bg-surface-1 p-2",
                SPAN[w.size],
                !edit ? "border-line" : w.id === selected ? "border-accent" : "border-dashed border-line-strong",
                drag?.from === i && "opacity-40",
                drag && drag.over === i && drag.from !== i && "border-solid border-accent",
              )}
            >
              <div className="min-h-0 flex-1">
                <WidgetView w={w} />
              </div>
              {edit && (
                <>
                  <button
                    type="button"
                    aria-pressed={w.id === selected}
                    aria-label={`Change ${liveDef(w.pid)?.name ?? w.pid}`}
                    className="absolute inset-0 rounded-panel"
                    onClick={() => setSelected(w.id === selected ? "" : w.id)}
                  />
                  <span
                    aria-hidden
                    className="absolute top-1 right-1 flex size-11 cursor-grab touch-none items-center justify-center rounded-control bg-surface-3 text-xl text-fg select-none"
                    {...grip(i)}
                  >
                    ⠿
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
