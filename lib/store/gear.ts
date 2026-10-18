// Feeds the gear estimate (lib/dashboard/gear.ts) from live polling and saves what it learns per car.
import { GearLearner, gearRatios, sanitizeClusters, type GearCluster } from "../dashboard/gear";
import { getSetting, setSetting, useSetting } from "../storage/settings";
import { GEAR, useLive } from "./live";

const KEY = "gear.learned";
const SAVE_MS = 10_000; // learning adds a sample per speed reading; save it at most this often
type Learned = Record<string, GearCluster[]>;

const carKey = () => getSetting<string | null>("garage.activeId", null) ?? "default";
const learned = (): Learned => {
  const v = getSetting<unknown>(KEY, {});
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Learned) : {};
};

let learner: { car: string; l: GearLearner; saved: number } | null = null;
function current() {
  const car = carKey();
  if (learner?.car !== car) learner = { car, l: new GearLearner(sanitizeClusters(learned()[car])), saved: Date.now() };
  return learner;
}

/** Live ids plus GEAR when the car reports 01A4, or RPM and speed to estimate it from. */
export const withGear = (ids: string[]) =>
  ids.includes("01A4") || (ids.includes("010C") && ids.includes("010D")) ? [...ids, GEAR.id] : ids;

/** Called by the polling glue for every reading (after it is recorded). */
export function feedGear(id: string, value: number, t: number) {
  const live = useLive.getState();
  if (id === "01A4") return live.record(GEAR.id, value, t);
  if (id !== "010D" || live.supported.includes("01A4")) return;
  const rpm = live.values["010C"];
  if (!rpm || Math.abs(t - rpm.t) > 500) return; // RPM is read every other request, so it's normally a few ms old
  const c = current();
  live.record(GEAR.id, c.l.sample(t, rpm.value, value) ?? NaN, t);
  if (c.l.changed && t - c.saved >= SAVE_MS) {
    setSetting(KEY, { ...learned(), [c.car]: c.l.clusters });
    c.l.changed = false;
    c.saved = t;
  }
}

/** [gears learned for the active car (as last saved), forget them]. */
export function useGearLearning(): [number, () => void] {
  const [all, save] = useSetting<unknown>(KEY, {});
  const [car] = useSetting<string | null>("garage.activeId", null);
  const key = car ?? "default";
  return [
    gearRatios(sanitizeClusters(all && typeof all === "object" ? (all as Learned)[key] : undefined)).length,
    () => {
      learner = null;
      save({ ...learned(), [key]: [] });
    },
  ];
}
