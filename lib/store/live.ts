import { create } from "zustand";
import { PIDS, type GaugeType } from "../obd/pids";
import { getCustomPids } from "./settings";

/**
 * Latest live values, written by the polling Scheduler (lib/polling) and read by every live feature.
 * Non-React code reads it with useLive.getState() / useLive.subscribe(). Values are raw registry units (metric).
 */
export interface LiveValue {
  value: number;
  t: number; // Date.now() of the reading
  history: { t: number; v: number }[]; // oldest first, last HISTORY_MS
  min: number;
  max: number;
  sum: number;
  count: number;
}

interface LiveState {
  /** Item ids the Scheduler polls: supported registry PIDs plus "ATRV". */
  supported: string[];
  hz: number;
  running: boolean;
  values: Record<string, LiveValue>;
  record: (id: string, value: number, t?: number) => void;
  reset: () => void;
}

export const HISTORY_MS = 60_000;
const HISTORY_MAX = 300;

/** Adapter voltage from ATRV, polled alongside the PIDs so it shares the same store. */
export const ATRV = { id: "ATRV", name: "Adapter voltage (ATRV)", unit: "V", min: 0, max: 16 };
export interface LiveDef {
  id: string;
  name: string;
  unit: string;
  min: number;
  max: number;
  gauge?: GaugeType;
  /** Set for enum / status PIDs: show text, keep out of gauges and alerts. */
  text?: (v: number) => string;
}
/** Registry PIDs, ATRV, and the user's custom PIDs (lib/obd/custom.ts). */
export const liveDef = (id: string): LiveDef | undefined =>
  PIDS[id] ?? (id === ATRV.id ? ATRV : getCustomPids().find((c) => c.id === id));

export const useLive = create<LiveState>((set) => ({
  supported: [],
  hz: 0,
  running: false,
  values: {},
  record: (id, value, t = Date.now()) =>
    set((s) => {
      const prev = s.values[id];
      const history = prev ? prev.history.filter((p) => p.t > t - HISTORY_MS).slice(-(HISTORY_MAX - 1)) : [];
      history.push({ t, v: value });
      const next: LiveValue = prev
        ? { value, t, history, min: Math.min(prev.min, value), max: Math.max(prev.max, value), sum: prev.sum + value, count: prev.count + 1 }
        : { value, t, history, min: value, max: value, sum: value, count: 1 };
      return { values: { ...s.values, [id]: next } };
    }),
  reset: () => set({ supported: [], hz: 0, values: {} }),
}));
