import { COOLANT_HOT_C } from "../dashboard/zones";
import { toDisplay, type UnitSystem } from "../units";

/** A user-defined alert. Values are raw registry units (metric), like everything in useLive. */
export interface AlertRule {
  id: string;
  /** Live item id: a registry PID ("0105") or "ATRV". */
  pid: string;
  op: "above" | "below";
  threshold: number;
  /** Once firing, the value must come back past threshold ∓ hysteresis before the alert clears (no flapping). */
  hysteresis: number;
  /** The condition must hold this long before firing, so one-sample spikes don't trigger it. */
  durationS: number;
  enabled: boolean;
}

export interface RuleState {
  pendingSince: number | null;
  active: boolean;
}
export const IDLE: RuleState = { pendingSince: null, active: false };

/** Feeds one reading (value at time t, ms) to a rule. Pure: returns the next state and any edge. */
export function evaluate(rule: AlertRule, state: RuleState, value: number, t: number): { state: RuleState; event: "fire" | "clear" | null } {
  const above = rule.op === "above";
  if (state.active) {
    const back = above ? value <= rule.threshold - rule.hysteresis : value >= rule.threshold + rule.hysteresis;
    return back ? { state: IDLE, event: "clear" } : { state, event: null };
  }
  if (!(above ? value > rule.threshold : value < rule.threshold)) return { state: IDLE, event: null };
  const since = state.pendingSince ?? t;
  if (t - since >= rule.durationS * 1000) return { state: { pendingSince: since, active: true }, event: "fire" };
  return { state: { pendingSince: since, active: false }, event: null };
}

/*
 * Every live unit converts linearly (°C→°F, km/h→mph, kPa→psi, L/h→gal/h), so the form can show thresholds in the
 * user's units and store raw metric. shortcut: assumes linear conversions; L/100km→mpg isn't, but no PID uses it.
 */
const lin = (unit: string, units: UnitSystem) => {
  const b = toDisplay(0, unit, units).value;
  return { a: toDisplay(1, unit, units).value - b, b };
};
export const fromDisplay = (v: number, unit: string, units: UnitSystem) => {
  const { a, b } = lin(unit, units);
  return (v - b) / a;
};
/** A difference (hysteresis) between units: scale only, no offset. */
export const deltaToDisplay = (d: number, unit: string, units: UnitSystem) => d * lin(unit, units).a;
export const deltaFromDisplay = (d: number, unit: string, units: UnitSystem) => d / lin(unit, units).a;

/**
 * Example rules that only prefill the form. NOT correct for any particular car: every number is a placeholder
 * the user must adjust (README [verify]). Coolant reuses the dashboard's estimate; RPM uses the user's redline setting.
 */
export const examples = (redlineRpm: number): { label: string; rule: Omit<AlertRule, "id"> }[] => [
  { label: "Coolant high", rule: { pid: "0105", op: "above", threshold: COOLANT_HOT_C, hysteresis: 3, durationS: 5, enabled: true } },
  { label: "Battery low (adapter voltage)", rule: { pid: "ATRV", op: "below", threshold: 12, hysteresis: 0.3, durationS: 10, enabled: true } },
  { label: "RPM at redline", rule: { pid: "010C", op: "above", threshold: redlineRpm, hysteresis: 300, durationS: 0, enabled: true } },
];
