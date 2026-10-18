/** Custom dashboard layouts (the "Custom" theme). Pure functions; persisted via useCustomLayouts in lib/store/settings.ts. */
export type WidgetKind = "gauge" | "number" | "bar" | "sparkline";
/** Width × height: width 1 = half, 2 = full; height 1 = normal, 2 = tall. "1x2" is new in JOID-0019. */
export type WidgetSize = "1x1" | "2x1" | "1x2" | "2x2";
export interface Widget {
  id: string;
  /** Live item id: a registry PID ("010C"), "ATRV", "GEAR" or a custom PID. */
  pid: string;
  kind: WidgetKind;
  size: WidgetSize;
}
export interface Layout {
  id: string;
  name: string;
  widgets: Widget[];
}
export interface CustomLayouts {
  active: string;
  layouts: Layout[];
}

export const EMPTY_LAYOUTS: CustomLayouts = { active: "", layouts: [] };
/** What Custom shows before any layout is saved (first run). A value the car doesn't report says so in its tile. */
export const STARTER_LAYOUTS: CustomLayouts = {
  active: "starter",
  layouts: [
    {
      id: "starter",
      name: "Starter",
      widgets: [
        { id: "starter-speed", pid: "010D", kind: "number", size: "1x1" },
        { id: "starter-gear", pid: "GEAR", kind: "number", size: "1x1" },
        { id: "starter-rpm", pid: "010C", kind: "gauge", size: "2x2" },
        { id: "starter-coolant", pid: "0105", kind: "bar", size: "1x1" },
        { id: "starter-fuel", pid: "012F", kind: "bar", size: "1x1" },
      ],
    },
  ],
};
const SIZES: WidgetSize[] = ["1x1", "2x1", "1x2", "2x2"];
export const KINDS: { id: WidgetKind; label: string }[] = [
  { id: "gauge", label: "Dial gauge" },
  { id: "number", label: "Number" },
  { id: "bar", label: "Bar" },
  { id: "sparkline", label: "Sparkline" },
];

let seq = 0;
export const newId = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

/** The active layout, falling back to the first one. */
export const activeLayout = (s: CustomLayouts) => s.layouts.find((l) => l.id === s.active) ?? s.layouts[0];

const mapLayout = (s: CustomLayouts, id: string, f: (l: Layout) => Layout): CustomLayouts => ({
  ...s,
  layouts: s.layouts.map((l) => (l.id === id ? f(l) : l)),
});

export function addLayout(s: CustomLayouts, name: string): CustomLayouts {
  const l: Layout = { id: newId(), name, widgets: [] };
  return { active: l.id, layouts: [...s.layouts, l] };
}

export const renameLayout = (s: CustomLayouts, id: string, name: string) => mapLayout(s, id, (l) => ({ ...l, name }));

export function duplicateLayout(s: CustomLayouts, id: string, name: string): CustomLayouts {
  const src = s.layouts.find((l) => l.id === id);
  if (!src) return s;
  const copy: Layout = { id: newId(), name, widgets: src.widgets.map((w) => ({ ...w, id: newId() })) };
  return { active: copy.id, layouts: [...s.layouts, copy] };
}

export function deleteLayout(s: CustomLayouts, id: string): CustomLayouts {
  const layouts = s.layouts.filter((l) => l.id !== id);
  return { active: s.active === id ? (layouts[0]?.id ?? "") : s.active, layouts };
}

export const setActive = (s: CustomLayouts, id: string): CustomLayouts => ({ ...s, active: id });

export const addWidget = (s: CustomLayouts, layoutId: string, pid: string, kind: WidgetKind, size: WidgetSize = "1x1") =>
  mapLayout(s, layoutId, (l) => ({ ...l, widgets: [...l.widgets, { id: newId(), pid, kind, size }] }));

export const updateWidget = (s: CustomLayouts, layoutId: string, widgetId: string, patch: Partial<Omit<Widget, "id">>) =>
  mapLayout(s, layoutId, (l) => ({ ...l, widgets: l.widgets.map((w) => (w.id === widgetId ? { ...w, ...patch } : w)) }));

export const removeWidget = (s: CustomLayouts, layoutId: string, widgetId: string) =>
  mapLayout(s, layoutId, (l) => ({ ...l, widgets: l.widgets.filter((w) => w.id !== widgetId) }));

/** Moves the widget at index `from` to index `to` (clamped). Used by drag-and-drop and the ↑/↓ buttons. */
export function moveWidget(s: CustomLayouts, layoutId: string, from: number, to: number): CustomLayouts {
  return mapLayout(s, layoutId, (l) => {
    const widgets = [...l.widgets];
    const target = Math.max(0, Math.min(widgets.length - 1, to));
    if (from === target || !widgets[from]) return l;
    const [w] = widgets.splice(from, 1);
    widgets.splice(target, 0, w!);
    return { ...l, widgets };
  });
}

export const isFull = (size: WidgetSize) => size[0] === "2";
export const isTall = (size: WidgetSize) => size[2] === "2";
export const sizeOf = (full: boolean, tall: boolean) => `${full ? 2 : 1}x${tall ? 2 : 1}` as WidgetSize;

const str = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/**
 * settings.json is hand-editable: repairs saved layouts instead of dropping them. Unknown kinds become numbers, unknown
 * sizes half width, missing ids get new ones; only entries that aren't objects, and widgets without a value id, go.
 */
export function sanitizeLayouts(v: unknown): CustomLayouts {
  const s = obj(v);
  if (!s || !Array.isArray(s.layouts)) return EMPTY_LAYOUTS;
  const layouts = s.layouts.flatMap((raw): Layout[] => {
    const l = obj(raw);
    if (!l) return [];
    const widgets = (Array.isArray(l.widgets) ? l.widgets : []).flatMap((rw): Widget[] => {
      const w = obj(rw);
      if (!w || typeof w.pid !== "string" || !w.pid) return [];
      return [
        {
          id: str(w.id, newId()),
          pid: w.pid,
          kind: KINDS.some((k) => k.id === w.kind) ? (w.kind as WidgetKind) : "number",
          size: SIZES.includes(w.size as WidgetSize) ? (w.size as WidgetSize) : "1x1",
        },
      ];
    });
    return [{ id: str(l.id, newId()), name: str(l.name, "Layout"), widgets }];
  });
  return { active: str(s.active, ""), layouts };
}
