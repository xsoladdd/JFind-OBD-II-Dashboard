"use client";

import { useState } from "react";
import { useUnits } from "@/lib/store/settings";
import { useTrips } from "@/lib/store/trips";
import { Replay } from "./Replay";
import { btn, card, disp, fmtDuration } from "./ui";

/** Past trips, newest first, each opening a replay. */
export function TripList() {
  const last = useTrips((s) => s.last);
  const [units] = useUnits();
  const [open, setOpen] = useState<string | null>(null);
  const trips = last ? [last] : [];

  return (
    <section className={card} aria-label="Trip log">
      <h2 className="mb-3 font-semibold">Trip log</h2>
      {!trips.length && <p className="text-sm text-zinc-400">No trips yet. Each drive is recorded automatically while connected.</p>}
      <ul className="space-y-2">
        {trips.map((t) => (
          <li key={t.base} className="rounded-md border border-zinc-800">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="font-medium">{new Date(t.summary.startedAt).toLocaleString()}</span>
              <span className="text-zinc-400">
                {disp(t.summary.distanceKm, "km", units, 1).join(" ")} · {fmtDuration(t.summary.durationS * 1000)}
              </span>
              <button className={`${btn} ml-auto`} onClick={() => setOpen(open === t.base ? null : t.base)} aria-expanded={open === t.base}>
                {open === t.base ? "Close" : "Replay"}
              </button>
            </div>
            {open === t.base && (
              <div className="border-t border-zinc-800 p-3">
                <Replay summary={t.summary} csv={t.csv} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
