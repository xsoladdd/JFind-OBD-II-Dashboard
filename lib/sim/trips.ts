// Trips simulator block: a demo "launch" so every performance-timer metric happens in Demo mode (the regular
// demo cycle tops out at 90 km/h). Demo values only, not a real car. Hooked into Elm327Emulator.answer() with one line.
import type { EngineState } from "./engine";

const HOLD_S = 3; // stopped, so an armed timer is ready
const ACCEL_S = 17; // v = 180·(1 − e^(−t/9)): 100 km/h at ~7 s, past the quarter mile at ~16 s
const BRAKE_KMH_S = 32; // ~0.9 g

let launchAt: number | null = null;

/** Starts one launch-and-brake run now (Demo mode button). */
export function simLaunch(now = Date.now()) {
  launchAt = now;
}

/** Speed during the launch, or null when no launch is running. */
export function launchSpeed(now = Date.now()): number | null {
  if (launchAt === null) return null;
  const t = (now - launchAt) / 1000 - HOLD_S;
  if (t < 0) return 0;
  const top = 180 * (1 - Math.exp(-ACCEL_S / 9));
  if (t < ACCEL_S) return 180 * (1 - Math.exp(-t / 9));
  const v = top - BRAKE_KMH_S * (t - ACCEL_S);
  if (v > 0) return v;
  if (t - ACCEL_S - top / BRAKE_KMH_S > HOLD_S) launchAt = null; // hold 0 a moment, then back to the normal cycle
  return 0;
}

/** Overrides speed (and RPM to match) while a launch runs. */
export function withLaunch(e: EngineState, now = Date.now()): EngineState {
  const v = launchSpeed(now);
  return v === null ? e : { ...e, speed: v, rpm: v === 0 ? 800 : 1500 + ((v * 40) % 4500), throttle: v === 0 ? 0 : 95 };
}
