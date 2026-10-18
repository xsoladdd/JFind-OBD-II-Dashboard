"use client";

import Link from "next/link";
import { Badge, linkClass, Stat } from "@/components/ui";
import { useGarage } from "@/lib/store/garage";
import { useTripAutoRecord, useUnits } from "@/lib/store/settings";
import { useTrips, type GpsState } from "@/lib/store/trips";
import { avgEconomy, avgSpeed, instantEconomy, type TripStats } from "@/lib/trips/calc";
import type { FuelFlow } from "@/lib/trips/fuel";
import { disp, fmtDuration, money, tripState } from "./format";

const GPS_TEXT: Record<GpsState, string> = {
  off: "",
  unsupported: "GPS: this browser has no location API.",
  waiting: "GPS: waiting for a fix…",
  on: "GPS: recording route.",
  denied: "GPS: permission denied, recording without a route.",
};

const ESTIMATE_TITLE = "Estimated from MAF air flow at an assumed stoichiometric air-fuel ratio and petrol density (see docs/trips.md).";

/** The top of Trips: the recorder state as one word, then the live trip's figures (or the last trip's), biggest first. */
export function TripComputer() {
  const { current, last, watching, now } = useTrips();
  const [autoRecord] = useTripAutoRecord();
  const state = tripState({ recording: !!current, watching, autoRecord });

  return (
    <section aria-labelledby="trip-computer" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="trip-computer" className="sr-only">
          Trip computer
        </h2>
        <p className="flex items-center gap-2.5 text-3xl font-bold" aria-live="polite">
          {current && <span aria-hidden className="size-3 animate-pulse rounded-full bg-accent" />}
          {state.word}
        </p>
        {!current && last && <Badge>Last trip</Badge>}
      </div>
      {!current && <p className="-mt-2 text-fg-muted">{state.hint}</p>}

      {current ? (
        <Figures stats={current.stats} durationMs={now - current.startedAt} speed={current.speed} flow={current.flow} />
      ) : (
        last && <Figures stats={last.summary} durationMs={last.summary.durationS * 1000} />
      )}
      {current && GPS_TEXT[current.gps] && <p className="text-sm text-fg-faint">{GPS_TEXT[current.gps]}</p>}
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
  const [dist, distUnit] = disp(stats.distanceKm, "km", units, 2);

  return (
    <div className="@container space-y-5">
      {/* One column in a narrow split-screen pane, where two 72px readouts side by side would run off the card. */}
      <div className="grid gap-4 @[18rem]:grid-cols-2">
        <Stat size="xl" label="Trip time" value={fmtDuration(durationMs)} />
        <Stat size="xl" label="Distance" value={dist} unit={distUnit} />
        {live && <Stat size="lg" label="Speed" value={disp(speed, "km/h", units)[0]} unit={disp(0, "km/h", units)[1]} />}
        <Stat size="lg" label="Avg speed" value={disp(avgSpeed(stats), "km/h", units)[0]} unit={disp(0, "km/h", units)[1]} note="while moving" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Moving" value={fmtDuration(stats.movingMs)} />
        <Stat label="Idle" value={fmtDuration(stats.idleMs)} />
      </div>

      <div className="space-y-3 border-t border-line pt-4">
        <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          Fuel
          {hasFuel &&
            (est ? (
              <Badge tone="warn" title={ESTIMATE_TITLE}>
                Estimate
              </Badge>
            ) : (
              <span className="text-sm font-normal text-fg-faint">from engine fuel rate (015E)</span>
            ))}
        </h3>
        {hasFuel ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
              value={car?.fuelPrice != null ? money(stats.fuelL * car.fuelPrice, car.currency) : null}
              note={
                car?.fuelPrice == null ? (
                  <Link href="/garage" className={linkClass}>
                    Set a fuel price in Garage
                  </Link>
                ) : undefined
              }
            />
          </div>
        ) : (
          <p className="text-fg-muted">
            Not available.{" "}
            {!car ? (
              <>
                <Link href="/garage" className={linkClass}>
                  Add the car in Garage
                </Link>{" "}
                with its fuel type for a MAF-based estimate.
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
