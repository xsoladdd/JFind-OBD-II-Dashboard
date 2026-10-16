// Dyno simulator block: one single-gear full-throttle pull for the dyno estimate in Demo mode. Demo values only,
// not a real car. Hooked into Elm327Emulator.answer() with one line.
import { aeroW, EXAMPLE_CDA_M2, EXAMPLE_CRR, rollingW } from "../trips/dyno";
import type { EngineState } from "./engine";

export const SIM_DYNO_MASS_KG = 1500; // demo car, used when the Garage has no curb weight in Demo mode
export const SIM_KMH_PER_RPM = 0.0185; // "3rd gear": 6500 rpm ≈ 120 km/h
export const SIM_DRIVELINE = 0.85; // demo share of engine power reaching the wheels
const FROM_RPM = 2000;
const TO_RPM = 6500;
const HOLD_S = 3; // steady in gear before flooring it
const COAST_S = 4; // lift off and coast in gear: RPM falls, the dyno closes the pull
const COAST_MS2 = 1; // demo coasting deceleration
const DT = 0.01;

/** Demo engine torque (N·m): a smooth hump peaking at 3800 rpm. */
export const simEngineNm = (rpm: number) => 260 - 0.000012 * (rpm - 3800) ** 2;
/** Demo wheel power (W) at an engine speed. */
export const simWheelW = (rpm: number) => SIM_DRIVELINE * simEngineNm(rpm) * ((2 * Math.PI * rpm) / 60);

/** Speed (km/h) every DT seconds of the pull, integrated from the demo curve with the example losses. */
const pull: number[] = (() => {
  const out: number[] = [];
  let v = (FROM_RPM * SIM_KMH_PER_RPM) / 3.6;
  while ((v * 3.6) / SIM_KMH_PER_RPM < TO_RPM) {
    out.push(v * 3.6);
    const rpm = (v * 3.6) / SIM_KMH_PER_RPM;
    const net = simWheelW(rpm) - rollingW(SIM_DYNO_MASS_KG, v, EXAMPLE_CRR) - aeroW(v, EXAMPLE_CDA_M2);
    v += (net / v / SIM_DYNO_MASS_KG) * DT;
  }
  return out;
})();
const PULL_S = pull.length * DT;

let pullAt: number | null = null;

/** Starts one pull now (Demo mode button). */
export function simPull(now = Date.now()) {
  pullAt = now;
}

/** Speed (km/h) and throttle during the demo pull, or null when none is running. */
export function pullState(now = Date.now()): { kmh: number; throttle: number } | null {
  if (pullAt === null) return null;
  const t = (now - pullAt) / 1000 - HOLD_S;
  if (t < 0) return { kmh: pull[0]!, throttle: 20 };
  if (t < PULL_S) return { kmh: pull[Math.floor(t / DT)]!, throttle: 100 };
  const c = t - PULL_S;
  if (c < COAST_S) return { kmh: pull[pull.length - 1]! - COAST_MS2 * 3.6 * c, throttle: 0 };
  pullAt = null; // back to the normal cycle
  return null;
}

/** Overrides speed, RPM (fixed ratio) and throttle while a demo pull runs. */
export function withPull(e: EngineState, now = Date.now()): EngineState {
  const s = pullState(now);
  return s ? { ...e, speed: s.kmh, rpm: s.kmh / SIM_KMH_PER_RPM, throttle: s.throttle, load: s.throttle } : e;
}
