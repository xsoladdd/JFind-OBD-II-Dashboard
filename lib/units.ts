export type UnitSystem = "metric" | "imperial";

const MI_KM = 1.609344; // international mile
const GAL_L = 3.785411784; // US gallon
const PSI_KPA = 6.894757293168;

/** Metric unit → imperial unit + converter. Exact definitional factors only. Units not listed stay as they are. */
const IMPERIAL: Record<string, { unit: string; f: (v: number) => number }> = {
  "km/h": { unit: "mph", f: (v) => v / MI_KM },
  km: { unit: "mi", f: (v) => v / MI_KM },
  "°C": { unit: "°F", f: (v) => (v * 9) / 5 + 32 },
  kPa: { unit: "psi", f: (v) => v / PSI_KPA },
  L: { unit: "gal", f: (v) => v / GAL_L },
  "L/h": { unit: "gal/h", f: (v) => v / GAL_L },
  "L/100km": { unit: "mpg", f: (v) => (v > 0 ? (100 / MI_KM) / (v / GAL_L) : 0) },
};

/** A raw metric value (as decoded by lib/obd/pids) in the user's unit system. */
export function toDisplay(value: number, unit: string, system: UnitSystem): { value: number; unit: string } {
  const c = system === "imperial" ? IMPERIAL[unit] : undefined;
  return c ? { value: c.f(value), unit: c.unit } : { value, unit };
}
