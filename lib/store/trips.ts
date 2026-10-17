import { create } from "zustand";
import { acquirePolling, requestFast } from "../polling";
import { MAX_GAP_MS, TripCalc, type TripStats } from "../trips/calc";
import { TripDetector } from "../trips/detect";
import { csvHeader, csvRow, tripFileBase, type Fix, type TripColumn, type TripSummary } from "../trips/format";
import { appendCsv, deleteTrip, listTrips, writeCsv, writeSummary, type SavedTrip } from "../trips/files";
import { fuelFlow, type FuelFlow } from "../trips/fuel";
import { useFolder } from "../storage/folder";
import { useConnection } from "./connection";
import { useGarage } from "./garage";
import { liveDef, useLive } from "./live";
import { getTripAutoRecord, getTripGps, getTripStopMin } from "./settings";
import { toast } from "./toasts";

export type GpsState = "off" | "unsupported" | "waiting" | "on" | "denied";

export interface LiveTrip {
  startedAt: number;
  vin: string | null;
  stats: TripStats;
  speed: number;
  /** Latest fuel flow, or null when this car gives none we can use. */
  flow: FuelFlow | null;
  gps: GpsState;
  fix: Fix | null;
}

export interface FinishedTrip {
  base: string; // file name without extension
  summary: TripSummary;
  csv: string;
  /** Both files are in the folder. */
  saved: boolean;
}

interface TripsState {
  /** Connected with auto-record on: the next drive will be recorded. */
  watching: boolean;
  current: LiveTrip | null;
  /** This session's last trip, kept in memory so it can be replayed even without a folder. */
  last: FinishedTrip | null;
  /** Trips in the folder, newest first; null until listed (or when the folder isn't ready). */
  saved: SavedTrip[] | null;
  now: number;
}

export const useTrips = create<TripsState>(() => ({ watching: false, current: null, last: null, saved: null, now: 0 }));

const folderReady = () => useFolder.getState().status === "ready";
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Re-reads the trip list from the folder. */
export async function refreshSavedTrips() {
  if (!folderReady()) return useTrips.setState({ saved: null });
  try {
    useTrips.setState({ saved: await listTrips() });
  } catch (e) {
    toast.warn(`Couldn't list saved trips: ${errText(e)}`);
  }
}

/** Deletes both files of a saved trip (the caller confirms first). */
export async function removeSavedTrip(base: string) {
  await deleteTrip(base);
  await refreshSavedTrips();
}

/* ---- recorder runtime: one per app, started from the shell ---- */

const ROW_MS = 1000;
/** CSV rows are appended to the file this often, so a crash loses at most this much. */
const FLUSH_MS = 5000;

interface Recording {
  startedAt: number;
  vin: string | null;
  calc: TripCalc;
  columns: TripColumn[];
  gpsCols: boolean;
  base: string;
  /** The whole CSV (for this session's replay) and the part not yet appended to the file. */
  csv: string;
  pending: string;
  summaryWritten: boolean;
  /** File writes for this trip, one after another. */
  io: Promise<void>;
  warned: boolean;
  releaseFast: () => void;
  gpsWatch: number | null;
  gps: GpsState;
  fix: (Fix & { t: number }) | null;
}

let rec: Recording | null = null;
let detector = new TripDetector(5 * 60_000);
let releasePolling: (() => void) | null = null;
let autoRecord = true;

const connected = () => useConnection.getState().status === "connected";

function startTrip(t: number) {
  const { supported } = useLive.getState();
  const flowId = supported.includes("015E") ? "015E" : supported.includes("0110") ? "0110" : null;
  const gpsCols = getTripGps();
  const r: Recording = {
    startedAt: t,
    vin: useGarage.getState().activeProfile?.vin ?? null,
    calc: new TripCalc(),
    columns: supported.map((id) => ({ id, name: liveDef(id)?.name ?? id, unit: liveDef(id)?.unit ?? "" })),
    gpsCols,
    base: tripFileBase(t, useGarage.getState().activeProfile?.vin ?? null),
    csv: "",
    pending: "",
    summaryWritten: false,
    io: Promise.resolve(),
    warned: false,
    releaseFast: requestFast(flowId ? ["010D", flowId] : ["010D"]),
    gpsWatch: null,
    gps: gpsCols ? "waiting" : "off",
    fix: null,
  };
  r.csv = r.pending = csvHeader(r.columns, gpsCols);
  if (gpsCols) startGps(r);
  rec = r;
  flush(r); // the summary (endedAt: null) goes in right away, so even a crashed trip is listed
  publish();
}

function summaryOf(r: Recording, endedAt: number | null): TripSummary {
  return {
    format: "obd-dash-trip",
    version: 1,
    startedAt: new Date(r.startedAt).toISOString(),
    endedAt: endedAt === null ? null : new Date(endedAt).toISOString(),
    vin: r.vin,
    durationS: Math.round(((endedAt ?? Date.now()) - r.startedAt) / 1000),
    ...r.calc.stats,
    columns: r.columns,
    gps: r.gpsCols,
  };
}

/** Queues a write of the unsaved rows (and the summary first, once). Keeps buffering while the folder isn't ready. */
function flush(r: Recording, final?: TripSummary) {
  r.io = r.io.then(async () => {
    if (!folderReady()) return;
    const text = r.pending;
    r.pending = "";
    try {
      if (!r.summaryWritten) await writeSummary(r.base, summaryOf(r, null));
      r.summaryWritten = true;
      if (text) await appendCsv(r.base, text);
      if (final) await writeSummary(r.base, final);
    } catch (e) {
      r.pending = text + r.pending;
      if (!r.warned) toast.warn(`Couldn't save trip data (still recording): ${errText(e)}`);
      r.warned = true;
    }
  });
  return r.io;
}

function startGps(r: Recording) {
  const geo = typeof navigator !== "undefined" ? navigator.geolocation : undefined;
  if (!geo?.watchPosition) return void (r.gps = "unsupported");
  r.gpsWatch = geo.watchPosition(
    (p) => {
      r.fix = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, t: Date.now() };
      r.gps = "on";
    },
    (e) => {
      if (e.code !== e.PERMISSION_DENIED) return void (r.gps = "waiting"); // no fix yet or timed out: keep trying
      r.gps = "denied";
      if (r.gpsWatch !== null) geo.clearWatch(r.gpsWatch);
      r.gpsWatch = null;
      toast.warn("Location permission denied: this trip is recorded without GPS.");
    },
    { enableHighAccuracy: true },
  );
}

function endTrip(t = Date.now()) {
  const r = rec;
  if (!r) return;
  rec = null;
  r.releaseFast();
  if (r.gpsWatch !== null) navigator.geolocation.clearWatch(r.gpsWatch);
  const summary = summaryOf(r, t);
  const last: FinishedTrip = { base: r.base, summary, csv: r.csv, saved: false };
  useTrips.setState({ current: null, last });
  void flush(r, summary).then(() => markSaved(last, !r.pending && r.summaryWritten && folderReady()));
}

function markSaved(trip: FinishedTrip, saved: boolean) {
  if (!saved) return;
  if (useTrips.getState().last === trip) useTrips.setState({ last: { ...trip, saved: true } });
  void refreshSavedTrips();
}

/** A trip that ended before the folder was ready is written whole once it is. */
async function saveLast() {
  const last = useTrips.getState().last;
  if (!last || last.saved || !folderReady()) return;
  try {
    await writeCsv(last.base, last.csv);
    await writeSummary(last.base, last.summary);
    markSaved(last, true);
  } catch (e) {
    toast.warn(`Couldn't save the last trip: ${errText(e)}`);
  }
}

function writeRow(r: Recording, now: number) {
  const { values } = useLive.getState();
  const fresh = (id: string) => {
    const v = values[id];
    return v && now - v.t <= MAX_GAP_MS ? v.value : undefined;
  };
  const fix = r.fix && now - r.fix.t <= MAX_GAP_MS ? r.fix : null;
  const row = csvRow(now, r.startedAt, r.columns.map((c) => fresh(c.id)), r.gpsCols, fix);
  r.csv += row;
  r.pending += row;
}

function publish(now = Date.now()) {
  const r = rec;
  const { values } = useLive.getState();
  useTrips.setState({
    now,
    watching: !!releasePolling,
    current: r && {
      startedAt: r.startedAt,
      vin: r.vin,
      stats: { ...r.calc.stats },
      speed: values["010D"]?.value ?? 0,
      flow: currentFlow(values),
      gps: r.gps,
      fix: r.fix,
    },
  });
}

function currentFlow(values: ReturnType<typeof useLive.getState>["values"]) {
  return fuelFlow({ fuelRate: values["015E"]?.value, maf: values["0110"]?.value, fuelType: useGarage.getState().activeProfile?.fuelType });
}

function syncConnection() {
  const status = useConnection.getState().status;
  const want = status === "connected" && autoRecord;
  if (want && !releasePolling) releasePolling = acquirePolling();
  if (!want && releasePolling) {
    releasePolling();
    releasePolling = null;
  }
  // A reconnect keeps the trip open; a real disconnect (or failed reconnect) ends it.
  if ((status === "idle" || status === "error") && detector.disconnect() === "end") endTrip();
}

function onLive(s: ReturnType<typeof useLive.getState>, prev: ReturnType<typeof useLive.getState>) {
  const speed = s.values["010D"];
  if (speed && speed !== prev.values["010D"]) {
    rec?.calc.addSpeed(speed.t, speed.value);
    if (autoRecord && connected()) {
      const ev = detector.speed(speed.t, speed.value);
      if (ev === "start") {
        startTrip(speed.t);
        rec!.calc.addSpeed(speed.t, speed.value);
      } else if (ev === "end") endTrip(speed.t);
    }
  }
  if (!rec) return;
  const rate = s.values["015E"];
  const maf = s.values["0110"];
  const fuelType = useGarage.getState().activeProfile?.fuelType;
  if (rate && rate !== prev.values["015E"]) rec.calc.addFlow(rate.t, rate.value, "015E");
  else if (!rate && maf && maf !== prev.values["0110"]) {
    const f = fuelFlow({ maf: maf.value, fuelType });
    if (f) rec.calc.addFlow(maf.t, f.lph, f.source);
  }
}

let lastRow = 0;
let lastFlush = 0;
function onTick() {
  const now = Date.now();
  autoRecord = getTripAutoRecord();
  detector.stopTimeoutMs = getTripStopMin() * 60_000;
  syncConnection();
  if (detector.tick(now) === "end") endTrip(now);
  if (rec && now - lastRow >= ROW_MS) {
    lastRow = now;
    writeRow(rec, now);
  }
  if (rec && now - lastFlush >= FLUSH_MS) {
    lastFlush = now;
    flush(rec);
  }
  publish(now);
}

/** Auto-records drives app-wide. Call once (the app shell); returns a stop function. */
export function startTripWatcher() {
  void useGarage.getState().load(); // fuel type, price and VIN come from the active profile
  detector = new TripDetector(getTripStopMin() * 60_000);
  autoRecord = getTripAutoRecord();
  lastRow = lastFlush = 0;
  const unsubLive = useLive.subscribe(onLive);
  const unsubConn = useConnection.subscribe(syncConnection);
  const unsubFolder = useFolder.subscribe((f, prev) => {
    if (f.status === prev.status) return;
    void refreshSavedTrips();
    if (f.status === "ready") {
      if (rec) flush(rec);
      void saveLast();
    }
  });
  void refreshSavedTrips();
  const timer = setInterval(onTick, 250);
  syncConnection();
  return () => {
    clearInterval(timer);
    unsubLive();
    unsubConn();
    unsubFolder();
    endTrip();
    releasePolling?.();
    releasePolling = null;
  };
}
