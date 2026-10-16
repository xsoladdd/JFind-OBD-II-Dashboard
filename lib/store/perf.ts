import { create } from "zustand";
import { requestFast } from "../polling";
import { useFolder } from "../storage/folder";
import { loadPerfRuns, savePerfRuns } from "../trips/files";
import { analyzeRun, hasResult, PerfTimer, type PerfPhase, type PerfResult, type PerfRun } from "../trips/perf";
import { useLive } from "./live";
import { toast } from "./toasts";

const MAX_RUNS = 20;

interface PerfState {
  phase: PerfPhase;
  /** Armed and the car has been seen stopped: moving off starts the run. */
  ready: boolean;
  /** The run in progress, analysed so far. */
  live: PerfResult | null;
  /** Newest first. */
  runs: PerfRun[];
  arm: () => void;
  disarm: () => void;
  /** Merges trips/perf-runs.json into the list (when the folder is ready). */
  load: () => Promise<void>;
}

const ready = () => useFolder.getState().status === "ready";
const merge = (a: PerfRun[], b: PerfRun[]) =>
  [...new Map([...a, ...b].map((r) => [r.at, r])).values()].sort((x, y) => y.at - x.at).slice(0, MAX_RUNS);

const timer = new PerfTimer();
let release: (() => void) | null = null;

export const usePerf = create<PerfState>((set, get) => ({
  phase: "idle",
  ready: false,
  live: null,
  runs: [],
  arm() {
    if (release) return;
    timer.arm();
    const releaseFast = requestFast(["010D"]);
    const unsub = useLive.subscribe((s, prev) => {
      const v = s.values["010D"];
      if (!v || v === prev.values["010D"]) return;
      const done = timer.sample({ t: v.t, v: v.value });
      if (done) {
        const r = analyzeRun(done);
        if (hasResult(r)) {
          const runs = merge([{ at: done[0]!.t, ...r }], get().runs);
          set({ runs });
          // Re-read first so a run saved from another tab (or before load() finished) isn't overwritten.
          if (ready()) loadPerfRuns().then((saved) => savePerfRuns(merge(runs, saved))).catch((e: unknown) => toast.warn(`Couldn't save the run: ${e instanceof Error ? e.message : e}`));
        }
      }
      set({ phase: timer.phase, ready: timer.ready, live: timer.phase === "running" ? analyzeRun(timer.run) : null });
    });
    release = () => {
      unsub();
      releaseFast();
    };
    set({ phase: timer.phase, ready: false, live: null });
  },
  disarm() {
    release?.();
    release = null;
    timer.disarm();
    set({ phase: "idle", ready: false, live: null });
  },
  async load() {
    if (!ready()) return;
    const saved = await loadPerfRuns().catch(() => []);
    set({ runs: merge(get().runs, saved) });
  },
}));

type Metric = "to100" | "to60mph" | "quarter" | "brake";
const time = (r: PerfRun, m: Metric) => (m === "quarter" ? r.quarter?.s : m === "brake" ? r.brake?.s : r[m]);

/** The quickest run for each metric. */
export const bestRun = (runs: PerfRun[], m: Metric) =>
  runs.reduce<PerfRun | null>((best, r) => {
    const t = time(r, m);
    return t !== undefined && (!best || t < time(best, m)!) ? r : best;
  }, null);
