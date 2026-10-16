"use client";

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

const WHOLE = new Set(["rpm", "km/h", "mph", "°C", "°F"]);

export function fmt(v: number | undefined, unit = "") {
  if (v === undefined || Number.isNaN(v)) return "—";
  const decimals = WHOLE.has(unit) || Math.abs(v) >= 100 ? 0 : unit === "V" ? 2 : 1;
  return v.toFixed(decimals);
}

/** Dark-surface categorical palette (fixed order; a series keeps its slot while shown). */
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500"];
