import type { TripStats } from "./calc";

export const TRIPS_DIR = "trips";

export interface TripColumn {
  id: string;
  name: string;
  unit: string;
}

/** The `.json` half of a trip. The first five keys are the stable header other tools can rely on. */
export interface TripSummary extends TripStats {
  format: "obd-dash-trip";
  version: 1;
  startedAt: string; // ISO
  endedAt: string | null; // null while recording (or after a crash)
  vin: string | null;
  durationS: number;
  columns: TripColumn[];
  gps: boolean;
}

export interface Fix {
  lat: number;
  lon: number;
  accuracy: number; // metres
}

/** `2026-10-16T12-34-56Z_<VIN or NOVIN>`: sortable, and safe as a file name everywhere. */
export function tripFileBase(startedAt: number, vin: string | null) {
  const iso = new Date(startedAt).toISOString().slice(0, 19).replace(/:/g, "-");
  const v = (vin ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `${iso}Z_${v || "NOVIN"}`;
}

export function summaryJson(s: Omit<TripSummary, "format" | "version">): string {
  const { startedAt, endedAt, vin, ...rest } = s;
  return JSON.stringify({ format: "obd-dash-trip", version: 1, startedAt, endedAt, vin, ...rest }, null, 2) + "\n";
}

/** Null when the text isn't a trip summary we understand. */
export function parseSummary(text: string): TripSummary | null {
  try {
    const j = JSON.parse(text) as TripSummary;
    return j?.format === "obd-dash-trip" && j.version === 1 && typeof j.startedAt === "string" ? j : null;
  } catch {
    return null;
  }
}

export const csvHeader = (columns: TripColumn[], gps: boolean) =>
  ["time_iso", "elapsed_s", ...columns.map((c) => c.id), ...(gps ? ["lat", "lon", "accuracy_m"] : [])].join(",") + "\n";

/** One sample row, raw metric units; a missing value is an empty cell. */
export function csvRow(t: number, startedAt: number, values: (number | undefined)[], gps: boolean, fix?: Fix | null) {
  const cells = [new Date(t).toISOString(), ((t - startedAt) / 1000).toFixed(1), ...values.map((v) => (v === undefined ? "" : String(+v.toFixed(4))))];
  if (gps) cells.push(...(fix ? [fix.lat.toFixed(6), fix.lon.toFixed(6), fix.accuracy.toFixed(0)] : ["", "", ""]));
  return cells.join(",") + "\n";
}

export interface TripData {
  t: number[]; // epoch ms per row
  cols: Record<string, (number | null)[]>; // by header name, e.g. "010D", "lat"
}

/** Parses our own CSV (no quoting needed: every cell is a number or an ISO time). Skips a torn last line. */
export function parseTripCsv(text: string): TripData {
  const lines = text.split("\n").filter((l) => l.trim());
  const head = (lines.shift() ?? "").split(",");
  const out: TripData = { t: [], cols: Object.fromEntries(head.slice(2).map((h) => [h, []])) };
  for (const line of lines) {
    const c = line.split(",");
    const t = Date.parse(c[0]!);
    if (c.length !== head.length || Number.isNaN(t)) continue;
    out.t.push(t);
    head.slice(2).forEach((h, i) => out.cols[h]!.push(c[i + 2] === "" ? null : Number(c[i + 2])));
  }
  return out;
}
