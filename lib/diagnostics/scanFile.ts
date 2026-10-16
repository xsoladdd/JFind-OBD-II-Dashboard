import type { Scan } from "./scan";

/** Scan files in the user's folder: scans/<YYYY-MM-DDTHH-mm-ssZ>_<VIN or NOVIN>.json. */
export const SCAN_DIR = "scans";

export type ScanFile =
  | { format: "obd-dash-scan"; version: 1; takenAt: string; vin: string | null; kind: "read"; scan: Scan }
  | { format: "obd-dash-scan"; version: 1; takenAt: string; vin: string | null; kind: "clear"; before: Scan; after: Scan };

// shortcut: two scans of the same car in the same second share a name (the later one wins); add ms if that ever matters.
export function scanFileName(at: number, vin: string | null): string {
  const stamp = new Date(at).toISOString().slice(0, 19).replace(/:/g, "-");
  return `${stamp}Z_${vin?.replace(/[^A-Za-z0-9]/g, "") || "NOVIN"}.json`;
}

const header = (scan: Scan) =>
  ({ format: "obd-dash-scan", version: 1, takenAt: new Date(scan.at).toISOString(), vin: scan.vin }) as const;

/** A plain read. The required header fields come first, as the folder-storage contract asks. */
export const readFile = (scan: Scan): ScanFile => ({ ...header(scan), kind: "read", scan });

/** One file per clear-codes run: the codes before and the automatic re-read after. */
export const clearFile = (before: Scan, after: Scan): ScanFile => ({ ...header(after), kind: "clear", before, after });

const codes = (v: unknown) => v === null || (Array.isArray(v) && v.every((c) => typeof c === "string"));
const status = (v: unknown) => v === null || (typeof v === "object" && Array.isArray((v as { monitors?: unknown }).monitors));

/** Enough shape checking that a hand-edited or foreign file can't crash the page. */
function isScan(v: unknown): v is Scan {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  const ff = s.freezeFrame as { values?: unknown } | null;
  return (
    typeof s.at === "number" &&
    (s.vin === null || typeof s.vin === "string") &&
    codes(s.stored) &&
    codes(s.pending) &&
    codes(s.permanent) &&
    status(s.status) &&
    status(s.thisCycle) &&
    (ff === null || (typeof ff === "object" && Array.isArray(ff.values))) &&
    Array.isArray(s.errors)
  );
}

/** Parses a file from the scans folder; throws with a readable reason when it isn't one of ours. */
export function parseScanFile(text: string): ScanFile {
  let f: Record<string, unknown>;
  try {
    f = JSON.parse(text);
  } catch {
    throw new Error("not valid JSON");
  }
  if (f?.format !== "obd-dash-scan") throw new Error("not an OBD Dash scan file");
  if (f.version !== 1) throw new Error(`unsupported scan file version ${String(f.version)}`);
  if (f.kind === "read" && isScan(f.scan)) return f as unknown as ScanFile;
  if (f.kind === "clear" && isScan(f.before) && isScan(f.after)) return f as unknown as ScanFile;
  throw new Error("scan file is damaged or incomplete");
}
