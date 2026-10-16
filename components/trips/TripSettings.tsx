"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_TRIP_STOP_MIN, useTripAutoRecord, useTripGps, useTripStopMin } from "@/lib/store/settings";
import { card } from "./ui";

const noop = () => () => {};
const useHasGeo = () => useSyncExternalStore(noop, () => "geolocation" in navigator, () => true);

export function TripSettings() {
  const [auto, setAuto] = useTripAutoRecord();
  const [stopMin, setStopMin] = useTripStopMin();
  const [gps, setGps] = useTripGps();
  const hasGeo = useHasGeo();

  return (
    <section className={card} aria-label="Trip settings">
      <h2 className="mb-3 font-semibold">Trip settings</h2>
      <div className="space-y-3 text-sm">
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="mt-1 h-4 w-4 accent-sky-500" />
          <span>
            Auto-record drives
            <span className="block text-xs text-zinc-400">
              Starts when the car moves while connected. Keeps live polling running whenever the adapter is connected.
            </span>
          </span>
        </label>
        <label className="flex items-center gap-3">
          <span className="flex-1">
            End a trip after being stopped for
            <span className="block text-xs text-zinc-400">Disconnecting always ends it. Default {DEFAULT_TRIP_STOP_MIN} min.</span>
          </span>
          <input
            type="number"
            min={1}
            max={120}
            value={stopMin}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 1) setStopMin(Math.min(120, Math.round(v)));
            }}
            className="w-20 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-right"
            aria-label="Stop timeout in minutes"
          />
          <span className="text-zinc-400">min</span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={gps} disabled={!hasGeo} onChange={(e) => setGps(e.target.checked)} className="mt-1 h-4 w-4 accent-sky-500" />
          <span>
            Record GPS route
            <span className="block text-xs text-zinc-400">
              {hasGeo
                ? "Off by default: your location is sensitive. When on, the phone's position is written into the trip file during a trip. It stays on this device."
                : "This browser has no location API."}
            </span>
          </span>
        </label>
      </div>
    </section>
  );
}
