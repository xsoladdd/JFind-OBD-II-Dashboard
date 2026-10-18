/**
 * Gear estimate from the RPM / speed ratio, for cars that don't report PID 01A4 (docs/custom-dashboard-and-alerts.md).
 * In gear with the clutch engaged, rpm per km/h is fixed by the gearbox, so steady ratios cluster around one value per
 * gear. Clusters are learned while driving and saved per car; the gears are numbered from the highest ratio (1st).
 */
export interface GearCluster {
  /** rpm per km/h */
  ratio: number;
  /** samples behind it (capped, so a cluster keeps adapting) */
  n: number;
}

const MIN_SPEED = 8; // km/h: below this the clutch is usually slipping
const MIN_RPM = 1000; // below this: idling or coasting in neutral, not a gear
const STABLE = 0.03; // two readings in a row within 3 % (+ rounding): clutch engaged, not mid-shift
const STABLE_MS = 2000;
const MATCH = 0.1; // a sample joins (and clusters merge) within 10 %: low-speed rounding is up to ±6 %, gears are 15 %+ apart
const ESTIMATE = 0.07; // a reading shows a gear within 7 % (+ rounding) of it; gear steps are usually 15 %+ apart
// Speed comes in whole km/h, so at low speed the ratio itself is only known to ±0.5 / speed.
const rounding = (speedKmh: number) => 0.5 / speedKmh;
const KNOWN = 8; // samples before a cluster counts as a gear
// 1st to top gear is about 3.5–5× in a car. Until the learned gears span 3×, 1st hasn't been seen yet and numbering
// from the highest ratio would be wrong (in Demo the upper gears are learned first), so the estimate keeps learning.
const MIN_SPREAD = 3;
const N_CAP = 500;
const MAX_CLUSTERS = 24;

const near = (a: number, b: number, tol: number) => Math.abs(a / b - 1) <= tol;

/** Adds one steady ratio sample: joins (and nudges) the nearest cluster, merges clusters that drift together. */
export function learn(clusters: GearCluster[], ratio: number): GearCluster[] {
  let i = -1;
  clusters.forEach((c, k) => {
    if (near(ratio, c.ratio, MATCH) && (i < 0 || Math.abs(ratio - c.ratio) < Math.abs(ratio - clusters[i]!.ratio))) i = k;
  });
  let out = [...clusters];
  if (i < 0) {
    out.push({ ratio, n: 1 });
    if (out.length > MAX_CLUSTERS) out = out.sort((a, b) => b.n - a.n).slice(0, MAX_CLUSTERS);
    return out;
  }
  const c = out[i]!;
  const n = Math.min(c.n + 1, N_CAP);
  out[i] = { ratio: c.ratio + (ratio - c.ratio) / n, n };
  const j = out.findIndex((d, k) => k !== i && near(d.ratio, out[i]!.ratio, MATCH));
  if (j >= 0) {
    const [a, b] = [out[i]!, out[j]!];
    out[i] = { ratio: (a.ratio * a.n + b.ratio * b.n) / (a.n + b.n), n: Math.min(a.n + b.n, N_CAP) };
    out.splice(j, 1);
  }
  return out;
}

/** The learned gear ratios, 1st gear first; empty while still learning (1st gear not seen yet). */
export function gearRatios(clusters: GearCluster[]) {
  const ratios = clusters
    .filter((c) => c.n >= KNOWN)
    .map((c) => c.ratio)
    .sort((a, b) => b - a);
  return ratios.length >= 2 && ratios[0]! / ratios.at(-1)! >= MIN_SPREAD ? ratios : [];
}

/** Gear number for a ratio, or undefined when it matches none (clutch in, shifting, neutral). */
export function gearFor(ratios: number[], ratio: number, tol = ESTIMATE): number | undefined {
  let best: number | undefined;
  ratios.forEach((r, i) => {
    if (near(ratio, r, tol) && (best === undefined || Math.abs(ratio - r) < Math.abs(ratio - ratios[best - 1]!))) best = i + 1;
  });
  return best;
}

/** settings.json is hand-editable: keep only well-formed clusters. */
export const sanitizeClusters = (v: unknown): GearCluster[] =>
  Array.isArray(v)
    ? v.filter(
        (c): c is GearCluster =>
          !!c && typeof c === "object" && Number.isFinite(c.ratio) && c.ratio > 0 && Number.isFinite(c.n) && c.n > 0,
      )
    : [];

/** Feeds speed readings (each with the RPM read next to it), learns and estimates. */
export class GearLearner {
  private prev: { t: number; ratio: number } | null = null;
  /** True once `clusters` changed since the caller last saved them. */
  changed = false;

  constructor(public clusters: GearCluster[] = []) {}

  /** The estimated gear, or undefined: stopped, idling, clutch in, shifting, or still learning. */
  sample(t: number, rpm: number, speedKmh: number): number | undefined {
    if (speedKmh < MIN_SPEED || rpm < MIN_RPM) {
      this.prev = null;
      return undefined;
    }
    const ratio = rpm / speedKmh;
    if (this.prev && t - this.prev.t <= STABLE_MS && near(ratio, this.prev.ratio, STABLE + rounding(speedKmh))) {
      this.clusters = learn(this.clusters, ratio);
      this.changed = true;
    }
    this.prev = { t, ratio };
    return gearFor(gearRatios(this.clusters), ratio, ESTIMATE + rounding(speedKmh));
  }
}
