"use client";

import { useSyncExternalStore } from "react";
import { Field, Input, Sheet, StoppedOnly, Switch } from "@/components/ui";
import { DEFAULT_TRIP_STOP_MIN, useTripAutoRecord, useTripGps, useTripStopMin } from "@/lib/store/settings";

const noop = () => () => {};
const useHasGeo = () => useSyncExternalStore(noop, () => "geolocation" in navigator, () => true);

/** Trip settings in one sheet, opened by the Trip settings button. Parked only: it has a number to type. */
export function TripSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [auto, setAuto] = useTripAutoRecord();
  const [stopMin, setStopMin] = useTripStopMin();
  const [gps, setGps] = useTripGps();
  const hasGeo = useHasGeo();

  return (
    <Sheet open={open} onClose={onClose} title="Trip settings">
      <div className="px-2 pb-2 sm:px-3">
        <StoppedOnly label="Trip settings">
          <div className="space-y-4">
            <Switch
              checked={auto}
              onChange={setAuto}
              label="Auto-record drives"
              description="Starts when the car moves while connected. Keeps live polling running whenever the adapter is connected."
            />
            <Field label="End a trip after being stopped for (min)" hint={`Disconnecting always ends it. Default ${DEFAULT_TRIP_STOP_MIN} min.`}>
              <Input name="end-a-trip" autoComplete="off"
                type="number"
                min={1}
                max={120}
                inputMode="numeric"
                value={stopMin}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 1) setStopMin(Math.min(120, Math.round(v)));
                }}
                className="max-w-32"
              />
            </Field>
            <Switch
              checked={gps}
              disabled={!hasGeo}
              onChange={setGps}
              label="Record GPS route"
              description={
                hasGeo
                  ? "Off by default: your location is sensitive. When on, the phone's position is written into the trip file during a trip. It stays on this device."
                  : "This browser has no location API."
              }
            />
          </div>
        </StoppedOnly>
      </div>
    </Sheet>
  );
}
