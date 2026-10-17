// Code history: follows each trouble code across the saved scans in scans/*.json. See docs/code-history.md.
import { describeDtc } from "../obd/dtc";
import { listFiles, readText } from "../storage/folder";
import type { Scan } from "./scan";
import { parseScanFile, SCAN_DIR, type ScanFile } from "./scanFile";
import { cell } from "./report";

export type ListName = "pending" | "stored" | "permanent";
const LISTS: ListName[] = ["pending", "stored", "permanent"];

export type CodeEvent =
  | { kind: "seen"; at: number; file: string; lists: ListName[] }
  | { kind: "cleared"; at: number; file: string };

/** active = stored (confirmed), pending, permanent, gone = absent from a full scan, unknown = the list read failed. */
export type CodeStatus = "active" | "pending" | "permanent" | "gone" | "unknown";

export interface CodeHistory {
  vin: string | null;
  code: string;
  firstSeen: number;
  lastSeen: number;
  /** Distinct scans the code appeared in. */
  timesSeen: number;
  events: CodeEvent[];
  /** Lists over time, e.g. ["pending", "stored", "stored+permanent"]; consecutive repeats merged. */
  path: string[];
  clearedCount: number;
  /** The latest return after a clear: a later scan with the code stored or pending again. */
  cameBack: { at: number; afterMs: number; file: string } | null;
  status: CodeStatus;
  /** Only for "gone": the first complete scan without the code. */
  goneSince: number | null;
}

export interface CarHistory {
  vin: string | null;
  scans: number;
  codes: CodeHistory[];
}

export interface History {
  cars: CarHistory[];
}

interface Snap {
  at: number;
  file: string;
  scan: Scan;
}
interface Clear {
  at: number;
  file: string;
  after: Scan;
}

const listsOf = (s: Scan, code: string) => LISTS.filter((l) => s[l]?.includes(code));
const complete = (s: Scan) => LISTS.every((l) => s[l] !== null);
const inActive = (s: Scan, code: string) => !!(s.stored?.includes(code) || s.pending?.includes(code));

/** Builds the history of every car (VIN, or null for scans without one) from parsed scan files. */
export function buildHistory(files: { name: string; file: ScanFile }[]): History {
  const snaps = new Map<string | null, Map<number, Snap>>();
  const clears = new Map<string | null, Clear[]>();
  const add = (scan: Scan, file: string) => {
    const m = snaps.get(scan.vin) ?? snaps.set(scan.vin, new Map()).get(scan.vin)!;
    if (!m.has(scan.at)) m.set(scan.at, { at: scan.at, file, scan }); // first writer wins
  };
  // Read files go first: a clear file's "before" is the live scan, which the previous read file already holds.
  for (const { name, file } of files) if (file.kind === "read") add(file.scan, name);
  for (const { name, file } of files) {
    if (file.kind !== "clear") continue;
    add(file.before, name);
    add(file.after, name);
    const list = clears.get(file.after.vin) ?? clears.set(file.after.vin, []).get(file.after.vin)!;
    list.push({ at: file.after.at, file: name, after: file.after });
  }

  const cars: CarHistory[] = [];
  for (const [vin, byAt] of snaps) {
    const ordered = [...byAt.values()].sort((a, b) => a.at - b.at);
    const carClears = (clears.get(vin) ?? []).sort((a, b) => a.at - b.at);
    const codes = new Set(ordered.flatMap((s) => LISTS.flatMap((l) => s.scan[l] ?? [])));
    const latest = ordered[ordered.length - 1]!;
    const out = [...codes].map((code) => codeHistory(vin, code, ordered, carClears, latest));
    out.sort((a, b) => rank(a.status) - rank(b.status) || b.lastSeen - a.lastSeen || a.code.localeCompare(b.code));
    cars.push({ vin, scans: ordered.length, codes: out });
  }
  cars.sort((a, b) => (carTime(b) - carTime(a)) || String(a.vin).localeCompare(String(b.vin)));
  return { cars };
}

const rank = (s: CodeStatus) => (s === "gone" ? 2 : s === "unknown" ? 1 : 0);
const carTime = (c: CarHistory) => Math.max(0, ...c.codes.map((x) => x.lastSeen));

function codeHistory(vin: string | null, code: string, snaps: Snap[], clears: Clear[], latest: Snap): CodeHistory {
  const events: CodeEvent[] = [];
  for (const s of snaps) {
    const lists = listsOf(s.scan, code);
    if (lists.length) events.push({ kind: "seen", at: s.at, file: s.file, lists });
  }
  // A clear counts for this code when the scan before it had the code stored/pending and the re-read does not.
  for (const c of clears) {
    const before = [...snaps].reverse().find((s) => s.at < c.at);
    if (before && inActive(before.scan, code) && c.after.stored !== null && c.after.pending !== null && !inActive(c.after, code))
      events.push({ kind: "cleared", at: c.at, file: c.file });
  }
  // On a tie the clear goes after the scan that holds the code (the "before" scan).
  events.sort((a, b) => a.at - b.at || (a.kind === b.kind ? 0 : a.kind === "seen" ? -1 : 1));

  const seen = events.filter((e): e is Extract<CodeEvent, { kind: "seen" }> => e.kind === "seen");
  let cameBack: CodeHistory["cameBack"] = null;
  let clearedAt: number | null = null;
  for (const e of events) {
    if (e.kind === "cleared") clearedAt = e.at;
    else if (clearedAt !== null && (e.lists.includes("stored") || e.lists.includes("pending"))) {
      cameBack = { at: e.at, afterMs: e.at - clearedAt, file: e.file };
      clearedAt = null;
    }
  }

  const path: string[] = [];
  for (const e of seen) {
    const label = e.lists.join("+");
    if (path[path.length - 1] !== label) path.push(label);
  }

  const now = listsOf(latest.scan, code);
  let status: CodeStatus;
  let goneSince: number | null = null;
  if (now.includes("stored")) status = "active";
  else if (now.includes("permanent")) status = "permanent";
  else if (now.includes("pending")) status = "pending";
  else if (complete(latest.scan)) {
    status = "gone";
    const lastSeen = seen[seen.length - 1]!.at;
    goneSince = snaps.find((s) => s.at > lastSeen && complete(s.scan))?.at ?? latest.at;
  } else status = "unknown"; // a failed list read is not evidence that the code is gone

  return {
    vin,
    code,
    firstSeen: seen[0]!.at,
    lastSeen: seen[seen.length - 1]!.at,
    timesSeen: seen.length,
    events,
    path,
    clearedCount: events.filter((e) => e.kind === "cleared").length,
    cameBack,
    status,
    goneSince,
  };
}

/** One row per code and car, RFC 4180 quoting with CRLF like the scan export. `car` is the label shown on screen. */
export function historyCsv(rows: { car: string; h: CodeHistory }[]): string {
  const iso = (t: number) => new Date(t).toISOString();
  const out: unknown[][] = [
    [
      "car", "vin", "code", "description", "first_seen", "last_seen", "times_seen", "lists_over_time",
      "times_cleared", "came_back_after_clear", "came_back_after_s", "status", "gone_since",
    ],
  ];
  for (const { car, h } of rows)
    out.push([
      car,
      h.vin ?? "",
      h.code,
      describeDtc(h.code),
      iso(h.firstSeen),
      iso(h.lastSeen),
      h.timesSeen,
      h.path.join(" > "),
      h.clearedCount,
      h.cameBack ? "yes" : "no",
      h.cameBack ? Math.round(h.cameBack.afterMs / 1000) : "",
      h.status,
      h.goneSince === null ? "" : iso(h.goneSince),
    ]);
  return out.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

// Parsed files by name, valid while size and lastModified are unchanged; a few hundred small files stay cheap to re-scan.
const cache = new Map<string, { size: number; lastModified: number; file: ScanFile | null }>();
export const clearHistoryCache = () => cache.clear();
const POOL = 8;

/** Reads and parses scans/*.json. Unreadable, damaged or foreign files are skipped and counted, never thrown. */
export async function loadScanFiles(): Promise<{ files: { name: string; file: ScanFile }[]; skipped: number }> {
  const listed = await listFiles(SCAN_DIR);
  const names = new Set(listed.map((f) => f.name));
  for (const n of cache.keys()) if (!names.has(n)) cache.delete(n);

  let skipped = 0;
  const todo = listed.filter((f) => {
    const c = cache.get(f.name);
    return f.name.endsWith(".json") && (!c || c.size !== f.size || c.lastModified !== f.lastModified);
  });
  let next = 0;
  const worker = async () => {
    for (let f = todo[next++]; f; f = todo[next++]) {
      try {
        const text = await readText(`${SCAN_DIR}/${f.name}`);
        if (text === null) continue; // deleted since the listing
        let file: ScanFile | null = null;
        try {
          file = parseScanFile(text);
        } catch {
          /* cached as unparseable below */
        }
        cache.set(f.name, { size: f.size, lastModified: f.lastModified, file });
      } catch {
        cache.delete(f.name); // unreadable now; try again next time
      }
    }
  };
  // shortcut: folder.ts runs file operations one at a time, so POOL only bounds queued reads; the cache is the speed-up.
  await Promise.all(Array.from({ length: Math.min(POOL, todo.length) }, worker));

  const files: { name: string; file: ScanFile }[] = [];
  for (const f of listed) {
    const file = f.name.endsWith(".json") ? cache.get(f.name)?.file : null;
    if (file) files.push({ name: f.name, file });
    else skipped++; // not a .json, damaged, foreign, or unreadable
  }
  return { files, skipped };
}
