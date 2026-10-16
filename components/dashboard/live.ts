"use client";

import { NO_VALUE } from "@/components/ui";
import { COOLANT_HOT_C, FUEL_LOW_PCT } from "@/lib/dashboard/zones";
import { toDisplay } from "@/lib/units";
import { liveDef, useLive } from "@/lib/store/live";
import { useUnits } from "@/lib/store/settings";

export const useLiveValue = (id: string) => useLive((s) => s.values[id]);

/** Latest value of a live item, converted to the user's units, with its converted display range. */
export function useDisplay(id: string) {
  const v = useLiveValue(id);
  const [units] = useUnits();
  const def = liveDef(id);
  const unit = def?.unit ?? "";
  const conv = (n: number) => toDisplay(n, unit, units).value;
  return {
    name: def?.name ?? id,
    unit: toDisplay(0, unit, units).unit,
    value: v ? conv(v.value) : undefined,
    min: conv(def?.min ?? 0),
    max: conv(def?.max ?? 100),
    conv,
    live: v,
  };
}
export type Display = ReturnType<typeof useDisplay>;

/** Shorter names for the drive view's labels (one or two words); anything else keeps its registry name. */
const SHORT: Record<string, string> = {
  "010C": "RPM",
  "010D": "Speed",
  "0105": "Coolant",
  "0111": "Throttle",
  "012F": "Fuel",
  "0104": "Load",
  "010F": "Intake air",
  "0142": "Module volts",
  ATRV: "Voltage",
  "015C": "Oil temp",
};
export const shortName = (id: string, name: string) => SHORT[id] ?? name;

const WHOLE = new Set(["rpm", "km/h", "mph", "°C", "°F"]);

export function fmt(v: number | undefined, unit = "") {
  if (v === undefined || Number.isNaN(v)) return NO_VALUE;
  const decimals = WHOLE.has(unit) || Math.abs(v) >= 100 ? 0 : unit === "V" ? 2 : 1;
  return v.toFixed(decimals);
}

/** A warning zone in display units. Always shown with its word as well as its colour (DESIGN.md §8). */
export interface Zone {
  from: number;
  to: number;
  tone: "warn" | "danger";
  word: string;
}
export const ZONE_COLOR = { warn: "var(--warn)", danger: "var(--danger)" } as const;
export const ZONE_TEXT = { warn: "text-warn", danger: "text-danger-fg" } as const;

/** The warning zones every theme draws: the redline setting plus lib/dashboard/zones.ts (estimates). */
export function zonesFor(pid: string, d: Display, redline: number): Zone[] {
  if (pid === "010C") return [{ from: redline, to: d.max, tone: "danger", word: "Redline" }];
  if (pid === "0105") return [{ from: d.conv(COOLANT_HOT_C), to: d.max, tone: "danger", word: "High" }];
  if (pid === "012F") return [{ from: d.min, to: d.conv(FUEL_LOW_PCT), tone: "warn", word: "Low" }];
  return [];
}

export const zoneAt = (value: number | undefined, zones: Zone[]) =>
  value === undefined ? undefined : zones.find((z) => value >= z.from && value <= z.to);

/** Chart series colours, in a fixed order (a series keeps its slot while shown). Tokens in app/globals.css. */
export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];
