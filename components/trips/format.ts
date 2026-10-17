import { fmt } from "@/components/dashboard/live";
import { NO_VALUE, type Tone } from "@/components/ui";
import { toDisplay, type UnitSystem } from "@/lib/units";

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
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return [NO_VALUE, u];
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

/** The trip recorder's state as one word for the top of Trips, plus a short line for when parked. */
export function tripState(s: { recording: boolean; watching: boolean; autoRecord: boolean }): { word: string; tone: Tone; hint: string } {
  if (s.recording) return { word: "Recording", tone: "ok", hint: "Ends after the car has been stopped for a while, or on disconnect." };
  if (s.watching) return { word: "Ready", tone: "accent", hint: "Recording starts automatically when the car moves." };
  if (!s.autoRecord) return { word: "Auto-record off", tone: "neutral", hint: "Turn it on in Trip settings." };
  return { word: "Not connected", tone: "neutral", hint: "Connect to the car to record a trip." };
}
