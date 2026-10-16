// Trip files in the user's folder (lib/storage/folder.ts): trips/<base>.json (summary) + trips/<base>.csv (samples).
import { appendText, listFiles, readText, removeFile, writeText } from "../storage/folder";
import { parseSummary, summaryJson, TRIPS_DIR, type TripSummary } from "./format";
import type { PerfRun } from "./perf";

const PERF_FILE = `${TRIPS_DIR}/perf-runs.json`;
const path = (base: string, ext: "json" | "csv") => `${TRIPS_DIR}/${base}.${ext}`;

export const writeSummary = (base: string, s: TripSummary) => writeText(path(base, "json"), summaryJson(s));
export const appendCsv = (base: string, text: string) => appendText(path(base, "csv"), text);
export const writeCsv = (base: string, text: string) => writeText(path(base, "csv"), text);
export const readCsv = (base: string) => readText(path(base, "csv"));

export interface SavedTrip {
  base: string;
  summary: TripSummary;
}

/** Every readable trip summary, newest first (file names start with the UTC start time, so they sort). */
export async function listTrips(): Promise<SavedTrip[]> {
  const names = (await listFiles(TRIPS_DIR)).map((f) => f.name).filter((n) => n.endsWith(".json") && `${TRIPS_DIR}/${n}` !== PERF_FILE);
  const out: SavedTrip[] = [];
  for (const n of names.sort().reverse()) {
    const summary = parseSummary((await readText(`${TRIPS_DIR}/${n}`)) ?? "");
    if (summary) out.push({ base: n.slice(0, -".json".length), summary });
  }
  return out;
}

export async function deleteTrip(base: string) {
  await removeFile(path(base, "json"));
  if ((await readText(path(base, "csv"))) !== null) await removeFile(path(base, "csv"));
}

export async function loadPerfRuns(): Promise<PerfRun[]> {
  try {
    const j = JSON.parse((await readText(PERF_FILE)) ?? "[]") as unknown;
    return Array.isArray(j) ? j.filter((r): r is PerfRun => typeof r?.at === "number" && typeof r?.hz === "number") : [];
  } catch {
    return []; // hand-edited into something unreadable: start a fresh list
  }
}

export const savePerfRuns = (runs: PerfRun[]) => writeText(PERF_FILE, JSON.stringify(runs, null, 2) + "\n");
