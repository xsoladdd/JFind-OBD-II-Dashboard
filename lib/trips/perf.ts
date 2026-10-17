import { MAX_GAP_MS } from "./calc";

export interface SpeedSample {
  t: number; // ms
  v: number; // km/h
}

export const KMH_60MPH = 96.56064; // 60 × 1.609344 (international mile)
export const QUARTER_MILE_M = 402.336; // 1320 ft, exact
/** A run that hasn't stopped after this long is closed anyway (app default, not a standard). */
export const MAX_RUN_MS = 120_000;

export interface PerfResult {
  /** Seconds from moving off. */
  to100?: number;
  to60mph?: number;
  quarter?: { s: number; trapKmh: number };
  /** 100 → 0 km/h braking: seconds and metres. */
  brake?: { s: number; m: number };
  /** Speed readings per second during the run: the accuracy limit. */
  hz: number;
  samples: number;
}

export interface PerfRun extends PerfResult {
  at: number; // epoch ms the run started
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

/** Cumulative distance in metres at each sample (trapezoidal). */
function cumDistance(s: SpeedSample[]) {
  const d = [0];
  for (let i = 1; i < s.length; i++) d.push(d[i - 1]! + (((s[i - 1]!.v + s[i]!.v) / 2) * (s[i]!.t - s[i - 1]!.t)) / 3600);
  return d;
}

/** Time (ms) where `get` first rises through `th` in `vals`, interpolated linearly between samples. */
function riseTime(s: SpeedSample[], vals: number[], th: number) {
  for (let i = 1; i < s.length; i++) {
    const a = vals[i - 1]!;
    const b = vals[i]!;
    if (a < th && b >= th) return { i, t: lerp(s[i - 1]!.t, s[i]!.t, (th - a) / (b - a)) };
  }
  return null;
}

/**
 * All timer metrics from one run. `s[0]` is the last 0 km/h reading before moving off, so start times are
 * conservative by up to one sample interval. The OBD speed is whole km/h, so results are approximate.
 */
export function analyzeRun(s: SpeedSample[]): PerfResult {
  const out: PerfResult = { hz: 0, samples: s.length };
  if (s.length < 2) return out;
  const t0 = s[0]!.t;
  out.hz = (s.length - 1) / ((s[s.length - 1]!.t - t0) / 1000);
  const v = s.map((p) => p.v);
  const up100 = riseTime(s, v, 100);
  if (up100) out.to100 = (up100.t - t0) / 1000;
  const up60 = riseTime(s, v, KMH_60MPH);
  if (up60) out.to60mph = (up60.t - t0) / 1000;
  const d = cumDistance(s);
  const q = riseTime(s, d, QUARTER_MILE_M);
  if (q) {
    const f = (q.t - s[q.i - 1]!.t) / (s[q.i]!.t - s[q.i - 1]!.t);
    out.quarter = { s: (q.t - t0) / 1000, trapKmh: lerp(v[q.i - 1]!, v[q.i]!, f) };
  }
  // Braking: the last fall through 100 km/h before the final 0 km/h reading.
  const end = s.length - 1;
  if (v[end] === 0) {
    for (let i = end; i >= 1; i--) {
      if (v[i - 1]! >= 100 && v[i]! < 100) {
        const f = (v[i - 1]! - 100) / (v[i - 1]! - v[i]!);
        const tb = lerp(s[i - 1]!.t, s[i]!.t, f);
        const db = lerp(d[i - 1]!, d[i]!, f);
        out.brake = { s: (s[end]!.t - tb) / 1000, m: d[end]! - db };
        break;
      }
    }
  }
  return out;
}

export const hasResult = (r: PerfResult) => !!(r.to100 || r.to60mph || r.quarter || r.brake);

export type PerfPhase = "idle" | "armed" | "running";

/**
 * Hands-free timer. arm() while stopped; the run starts on the first moving reading after a 0 km/h one and ends
 * when the car stops again (or after MAX_RUN_MS / a reading gap), then it re-arms for the next run.
 */
export class PerfTimer {
  phase: PerfPhase = "idle";
  run: SpeedSample[] = [];
  private lastZero: SpeedSample | null = null;

  arm() {
    this.phase = "armed";
    this.run = [];
    this.lastZero = null;
  }

  disarm() {
    this.phase = "idle";
    this.run = [];
  }

  /** True once the car has been seen stopped, i.e. the next move starts a run. */
  get ready() {
    return this.lastZero !== null;
  }

  /** Feed a speed reading; returns the finished run's samples when one ends. */
  sample(p: SpeedSample): SpeedSample[] | null {
    if (this.phase === "armed") {
      if (p.v === 0) this.lastZero = p;
      else if (this.lastZero && p.t - this.lastZero.t <= MAX_GAP_MS) {
        this.phase = "running";
        this.run = [this.lastZero, p];
      } else this.lastZero = null;
      return null;
    }
    if (this.phase !== "running") return null;
    const prev = this.run[this.run.length - 1]!;
    if (p.t - prev.t > MAX_GAP_MS) return this.finish(p.v === 0 ? p : null);
    this.run.push(p);
    if (p.v === 0 || p.t - this.run[0]!.t > MAX_RUN_MS) return this.finish(p.v === 0 ? p : null);
    return null;
  }

  private finish(zero: SpeedSample | null) {
    const done = this.run;
    this.phase = "armed";
    this.run = [];
    this.lastZero = zero;
    return done;
  }
}
