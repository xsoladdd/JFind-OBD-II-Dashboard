"use client";

import { cx } from "@/components/ui";
import { useRedline } from "@/lib/store/settings";
import { Gauge } from "../Gauge";
import { useDisplay, zonesFor } from "../live";

const PIDS = [
  { id: "010C", tickScale: 1000, primary: true },
  { id: "010D", tickScale: 1, ticks: 12, primary: true },
  { id: "0105", tickScale: 1 },
  { id: "012F", tickScale: 1 },
];

function Cell({ id, tickScale, ticks, primary }: (typeof PIDS)[number]) {
  const [redline] = useRedline();
  const d = useDisplay(id);
  return (
    <div className={cx("min-h-0 min-w-0 rounded-panel border border-line bg-surface-1 p-2", primary && "col-span-2 md:col-span-1")}>
      <Gauge label={d.name} unit={d.unit} value={d.value} min={d.min} max={d.max} zones={zonesFor(id, d, redline)} tickScale={tickScale} ticks={ticks} />
    </div>
  );
}

/** Four needle gauges. Portrait: RPM and speed full width, coolant and fuel side by side. Desktop: 2×2. Landscape phone: one row. */
export function Classic() {
  return (
    <div className="grid h-full grid-cols-2 grid-rows-[1fr_1fr_0.75fr] gap-3 md:grid-rows-2 short:grid-cols-4 short:grid-rows-1">
      {PIDS.map((p) => (
        <Cell key={p.id} {...p} />
      ))}
    </div>
  );
}
