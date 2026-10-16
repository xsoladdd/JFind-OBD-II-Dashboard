import type { ReactNode } from "react";
import { fmt } from "@/components/dashboard/live";
import { toDisplay, type UnitSystem } from "@/lib/units";

export { btn, btnPrimary, card } from "@/components/garage/ui";

/** h:mm:ss, or m:ss under an hour. */
export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60));
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm.padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
}

/** A raw metric value in the user's units, as [number text, unit]. */
export function disp(raw: number | null | undefined, unit: string, units: UnitSystem, decimals?: number): [string, string] {
  const u = toDisplay(0, unit, units).unit;
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return ["—", u];
  const v = toDisplay(raw, unit, units).value;
  return [decimals === undefined ? fmt(v, u) : v.toFixed(decimals), u];
}

export function money(n: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`; // not an ISO currency code
  }
}

export function Stat({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: ReactNode }) {
  return (
    <div className="rounded-md bg-zinc-950 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="font-mono text-xl font-semibold tabular-nums">
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-zinc-400">{unit}</span>}
      </div>
      {note && <div className="text-[11px] text-zinc-400">{note}</div>}
    </div>
  );
}

export const EstimateBadge = () => (
  <span
    title="Estimated from MAF air flow at an assumed stoichiometric air-fuel ratio and petrol density (see docs/trips.md)."
    className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-300"
  >
    estimate
  </span>
);
