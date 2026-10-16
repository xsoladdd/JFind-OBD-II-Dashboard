import { listFiles, readText } from "./folder";

export interface ScanSummary {
  name: string;
  size: number;
  /** null when the file isn't a readable obd-dash-scan file */
  takenAt: string | null;
  vin: string | null;
  kind: "read" | "clear" | null;
}

/** Only the fields every scan file starts with (format, version, takenAt, vin, kind); the rest belongs to Diagnostics. */
function summary(name: string, size: number, text: string | null): ScanSummary {
  try {
    const j = JSON.parse(text ?? "") as Record<string, unknown>;
    if (j.format === "obd-dash-scan" && typeof j.takenAt === "string")
      return {
        name,
        size,
        takenAt: j.takenAt,
        vin: typeof j.vin === "string" ? j.vin : null,
        kind: j.kind === "read" || j.kind === "clear" ? j.kind : null,
      };
  } catch {
    // not JSON: listed as unreadable so it can still be deleted
  }
  return { name, size, takenAt: null, vin: null, kind: null };
}

// shortcut: opens every scan file to read its header; fine for hundreds, page it if histories grow to thousands.
export async function listScans(): Promise<ScanSummary[]> {
  const files = (await listFiles("scans")).filter((f) => f.name.endsWith(".json"));
  const out = await Promise.all(files.map(async (f) => summary(f.name, f.size, await readText(`scans/${f.name}`))));
  return out.sort((a, b) => (b.takenAt ?? "").localeCompare(a.takenAt ?? "")); // unreadable files last
}

/** Newest first: names start with their UTC start time. */
export const listLogs = async () =>
  (await listFiles("logs")).filter((f) => f.name.endsWith(".log")).sort((a, b) => b.name.localeCompare(a.name));
