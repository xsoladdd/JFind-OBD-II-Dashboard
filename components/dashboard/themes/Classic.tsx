"use client";

import { COOLANT_HOT_C, FUEL_LOW_PCT } from "@/lib/dashboard/zones";
import { useRedline } from "@/lib/store/settings";
import { Gauge } from "../Gauge";
import { useDisplay } from "../live";

const RED = "#e66767";
const AMBER = "#c98500";

export function Classic() {
  const [redline] = useRedline();
  const rpm = useDisplay("010C");
  const speed = useDisplay("010D");
  const coolant = useDisplay("0105");
  const fuel = useDisplay("012F");
  return (
    <div className="mx-auto grid max-w-2xl grid-cols-2 gap-3">
      {[
        { d: rpm, zones: [{ from: redline, to: rpm.max, color: RED }], tickScale: 1000 },
        { d: speed, zones: [], tickScale: 1, ticks: 12 },
        { d: coolant, zones: [{ from: coolant.conv(COOLANT_HOT_C), to: coolant.max, color: RED }], tickScale: 1 },
        { d: fuel, zones: [{ from: fuel.min, to: fuel.conv(FUEL_LOW_PCT), color: AMBER }], tickScale: 1 },
      ].map(({ d, zones, tickScale, ticks }) => (
        <div key={d.name} className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 sm:p-4">
          <Gauge label={d.name} unit={d.unit} value={d.value} min={d.min} max={d.max} zones={zones} tickScale={tickScale} ticks={ticks} />
        </div>
      ))}
    </div>
  );
}
