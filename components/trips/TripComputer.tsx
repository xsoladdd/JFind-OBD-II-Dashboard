"use client";

import Link from "next/link";
import { useGarage } from "@/lib/store/garage";
import { useTripAutoRecord, useUnits } from "@/lib/store/settings";
import { useTrips, type GpsState } from "@/lib/store/trips";
import { avgEconomy, avgSpeed, instantEconomy, type TripStats } from "@/lib/trips/calc";
import type { FuelFlow } from "@/lib/trips/fuel";
import { card, disp, EstimateBadge, fmtDuration, money, Stat } from "./ui";

const GPS_TEXT: Record<GpsState, string> = {
  off: "",
  unsupported: "GPS: this browser has no location API.",
  waiting: "GPS: waiting for a fix…",
  on: "GPS: recording route.",
  denied: "GPS: permission denied, recording without a route.",
};

/** Live trip computer while a trip runs; otherwise the last trip's figures. */
export function TripComputer() {
  const { current, last, watching, now } = useTrips();
  const [autoRecord] = useTripAutoRecord();

  if (current)
    return (
      <section className={card} aria-label="Trip computer">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
          Trip in progress
        </h2>
        <Figures stats={current.stats} durationMs={now - current.startedAt} speed={current.speed} flow={current.flow} />
        {GPS_TEXT[current.gps] && <p className="mt-2 text-xs text-zinc-400">{GPS_TEXT[current.gps]}</p>}
      </section>
    );

  return (
    <section className={card} aria-label="Trip computer">
      <h2 className="mb-1 font-semibold">Trip computer</h2>
      <p className="mb-3 text-sm text-zinc-400">
        {watching
          ? "Waiting for the car to move: recording starts automatically."
          : !autoRecord
            ? "Auto-record is off (see settings below)."
            : "Connect to the car to record a trip."}
      </p>
      {last && (
        <>
          <h3 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Last trip</h3>
          <Figures stats={last.summary} durationMs={last.summary.durationS * 1000} />
        </>
      )}
    </section>
  );
}

function Figures({ stats, durationMs, speed, flow }: { stats: TripStats; durationMs: number; speed?: number; flow?: FuelFlow | null }) {
  const [units] = useUnits();
  const car = useGarage((s) => s.activeProfile);
  const live = speed !== undefined;
  const est = stats.fuelSource === "estimate" || flow?.source === "estimate";
  const inst = flow ? instantEconomy(flow.lph, speed ?? 0) : null;
  const avgEco = avgEconomy(stats);
  const hasFuel = live ? !!flow || !!stats.fuelSource : !!stats.fuelSource;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Distance" value={disp(stats.distanceKm, "km", units, 2)[0]} unit={disp(0, "km", units)[1]} />
        <Stat label="Trip time" value={fmtDuration(durationMs)} />
        <Stat label="Avg speed" value={disp(avgSpeed(stats), "km/h", units)[0]} unit={disp(0, "km/h", units)[1]} note="while moving" />
        <Stat label="Moving" value={fmtDuration(stats.movingMs)} />
        <Stat label="Idle" value={fmtDuration(stats.idleMs)} />
        {live && <Stat label="Speed" value={disp(speed, "km/h", units)[0]} unit={disp(0, "km/h", units)[1]} />}
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
          Fuel
          {hasFuel && (est ? <EstimateBadge /> : <span className="normal-case text-zinc-500">from engine fuel rate (015E)</span>)}
        </h3>
        {hasFuel ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Used" value={disp(stats.fuelL, "L", units, 2)[0]} unit={disp(0, "L", units)[1]} />
            {live &&
              (inst !== null ? (
                <Stat label="Instant" value={disp(inst, "L/100km", units)[0]} unit={disp(0, "L/100km", units)[1]} />
              ) : (
                <Stat label="Instant" value={disp(flow?.lph, "L/h", units)[0]} unit={disp(0, "L/h", units)[1]} note="stopped" />
              ))}
            <Stat label="Average" value={disp(avgEco, "L/100km", units)[0]} unit={disp(0, "L/100km", units)[1]} />
            <Stat
              label="Cost"
              value={car?.fuelPrice != null ? money(stats.fuelL * car.fuelPrice, car.currency) : "—"}
              note={car?.fuelPrice == null ? <Link href="/garage" className="underline">Set a fuel price in Garage</Link> : undefined}
            />
          </div>
        ) : (
          <p className="text-sm text-zinc-400">
            Not available.{" "}
            {!car ? (
              <>
                <Link href="/garage" className="text-sky-300 underline">Add the car in Garage</Link> with its fuel type for a MAF-based estimate.
              </>
            ) : car.fuelType === "diesel" ? (
              "This car doesn't report its engine fuel rate (015E), and a diesel doesn't run at a fixed air-fuel ratio, so there's no reliable MAF estimate."
            ) : car.fuelType === "other" ? (
              "This car doesn't report its engine fuel rate (015E), and the MAF estimate only covers petrol."
            ) : (
              "This car reports neither engine fuel rate (015E) nor MAF air flow (0110)."
            )}
          </p>
        )}
      </div>
    </div>
  );
}
