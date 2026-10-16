import { create } from "zustand";
import { requestFast } from "../polling";
import { useFolder } from "../storage/folder";
import { analyzePull, DynoRecorder, type DynoInputs, type DynoRun, type Pull } from "../trips/dyno";
import { deleteDynoRun, listDynoRuns, saveDynoRun } from "../trips/files";
import { useLive } from "./live";
import { toast } from "./toasts";

interface DynoState {
  armed: boolean;
  /** The RPM climb in progress: [from, peak]. */
  climb: [number, number] | null;
  /** Why the last pull was thrown away, until the next good one. */
  rejected: string | null;
  /** Every car's runs, newest first. */
  runs: DynoRun[];
  /** Kept current by the dyno card: what the next pull is computed with and which car it's saved under. */
  setup: { vin: string | null; inputs: DynoInputs } | null;
  arm: () => void;
  disarm: () => void;
  /** Merges dyno/*.json into the list, and saves runs made before the folder was ready. */
  load: () => Promise<void>;
  remove: (r: DynoRun) => Promise<void>;
}

const ready = () => useFolder.getState().status === "ready";
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const merge = (a: DynoRun[], b: DynoRun[]) => [...new Map([...a, ...b].map((r) => [r.at, r])).values()].sort((x, y) => y.at - x.at);

const rec = new DynoRecorder();
let release: (() => void) | null = null;

export const useDyno = create<DynoState>((set, get) => {
  function finish(pull: Pull) {
    const setup = get().setup;
    if (!setup) return;
    const { inputs, vin } = setup;
    const a = analyzePull(pull, inputs.curbKg + inputs.extraKg, inputs.losses);
    if (!a.ok) {
      set({ rejected: a.reason });
      toast.warn(`Dyno pull not used: ${a.reason}.`);
      return;
    }
    const run: DynoRun = { ...a.result, at: pull.rpm[0]!.t, vin, inputs, raw: pull };
    set({ runs: merge([run], get().runs), rejected: null });
    if (ready()) saveDynoRun(run).catch((e: unknown) => toast.warn(`Couldn't save the dyno run: ${errText(e)}`));
  }

  return {
    armed: false,
    climb: null,
    rejected: null,
    runs: [],
    setup: null,
    arm() {
      if (release) return;
      rec.arm();
      const releaseFast = requestFast(["010C", "010D"]);
      const unsub = useLive.subscribe((s, prev) => {
        const v = s.values["010D"];
        if (v && v !== prev.values["010D"]) rec.addSpeed({ t: v.t, v: v.value });
        const r = s.values["010C"];
        if (!r || r === prev.values["010C"]) return;
        const pull = rec.addRpm({ t: r.t, v: r.value });
        if (pull) finish(pull);
        set({ climb: rec.climb });
      });
      release = () => {
        unsub();
        releaseFast();
      };
      set({ armed: true, climb: null });
    },
    disarm() {
      release?.();
      release = null;
      rec.disarm();
      set({ armed: false, climb: null });
    },
    async load() {
      if (!ready()) return;
      const saved = await listDynoRuns().catch(() => []);
      const onDisk = new Set(saved.map((r) => r.at));
      for (const r of get().runs) if (!onDisk.has(r.at)) await saveDynoRun(r).catch(() => {});
      set({ runs: merge(get().runs, saved) });
    },
    async remove(r) {
      set({ runs: get().runs.filter((x) => x.at !== r.at) });
      if (ready()) await deleteDynoRun(r).catch((e: unknown) => toast.warn(`Couldn't delete the dyno run: ${errText(e)}`));
    },
  };
});
