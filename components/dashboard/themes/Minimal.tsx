"use client";

import { useLive } from "@/lib/store/live";
import { Sparkline } from "../Sparkline";
import { Readout } from "../Readout";
import { useLiveValue } from "../live";

function Card({ id }: { id: string }) {
  const live = useLiveValue(id);
  return (
    <div className="rounded-panel border border-line bg-surface-1 p-4">
      <Readout id={id} valueClass="text-4xl" />
      <Sparkline points={live?.history ?? []} />
    </div>
  );
}

/** A card for every polled value with a 60 s trend. Scrolls when the car reports many PIDs. */
export function Minimal() {
  const supported = useLive((s) => s.supported);
  return (
    <div className="grid h-full auto-rows-min grid-cols-2 gap-3 overflow-y-auto overscroll-contain lg:grid-cols-4 short:grid-cols-3">
      {supported.map((id) => (
        <Card key={id} id={id} />
      ))}
    </div>
  );
}
