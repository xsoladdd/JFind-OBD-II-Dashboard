// Demo-only "hold parked": pins the simulated car at a standstill so the stopped state (unlocked forms) can be reached
// on demand instead of waiting for the idle part of the demo cycle. Hooked into Elm327Emulator.answer() with one line.
import { create } from "zustand";
import type { EngineState } from "./engine";

const SIM_IDLE_RPM = 780; // the demo cycle's own idle (lib/sim/engine.ts)

export const useSimPark = create<{ parked: boolean }>(() => ({ parked: false }));
export const setSimParked = (parked: boolean) => useSimPark.setState({ parked });

/** Speed 0 and idle while held; an engine that is off stays off. */
export function withPark(e: EngineState): EngineState {
  return useSimPark.getState().parked ? { ...e, speed: 0, throttle: 0, rpm: Math.min(e.rpm, SIM_IDLE_RPM) } : e;
}
