// Dyno-run estimate (docs/dyno.md): wheel power and torque from one single-gear full-throttle pull, from 010C + 010D.
// Pure logic, no IO. Everything here is an estimate.
import type { UnitSystem } from "../units";
import { MAX_GAP_MS } from "./calc";

export interface Pt {
  t: number; // ms
  v: number;
}

// App defaults for spotting and checking a pull. Not standards, see docs/dyno.md.
export const DROP_RPM = 200; // RPM this far below the peak ends the pull (lift-off, clutch, gear change)
export const MIN_RISE_RPM_S = 50; // slower than this over RISE_WINDOW_MS is not pulling (cruise, idle) [verify]
export const RISE_WINDOW_MS = 500;
export const MIN_SPAN_RPM = 1500;
export const MIN_DURATION_S = 2;
export const MAX_PULL_MS = 30_000;
export const MIN_SPEED_KMH = 10; // below this, whole-km/h steps are too coarse for the ratio fit
export const RATIO_TOL = 0.05; // a reading may be 1 km/h + 5 % off the fitted ratio [verify]
export const HALF_WINDOW_S = 0.6; // smoothing window, ± seconds
const MIN_FIT_POINTS = 5;

export const G = 9.80665; // m/s², standard gravity (CGPM 1901)
export const RHO_ISA = 1.225; // kg/m³, ISA sea level; real air density varies with altitude and temperature [verify]

/**
 * Typical example values, not this car's [verify]. Sources: Wikipedia "Rolling resistance" (ordinary car tyres on
 * concrete, Crr 0.010–0.015) and "Automobile drag coefficient" (passenger-car CdA tables, mostly ~0.5–0.9 m²).
 */
export const EXAMPLE_CRR = 0.01;
export const EXAMPLE_CDA_M2 = 0.65;

export interface Losses {
  crr: number;
  cdaM2: number;
}

export const rollingW = (massKg: number, vMs: number, crr: number) => crr * massKg * G * vMs;
export const aeroW = (vMs: number, cdaM2: number) => 0.5 * RHO_ISA * cdaM2 * vMs ** 3;

/** Wheel power (W): accelerating the mass, plus rolling and aero losses when given. */
export const powerW = (massKg: number, vMs: number, aMs2: number, losses: Losses | null) =>
  massKg * aMs2 * vMs + (losses ? rollingW(massKg, vMs, losses.crr) + aeroW(vMs, losses.cdaM2) : 0);

/** Unloaded tyre radius (m) from an ISO metric size such as "205/55 R16" or "225/40ZR18 92W"; null if not one. */
export function tyreRadiusM(size: string): number | null {
  const m = /^\s*(\d{3})\s*\/\s*(\d{2,3})\s*Z?R\s*F?\s*(\d{2})\b/i.exec(size);
  if (!m) return null;
  const [w, ar, rim] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return ((rim * 25.4) / 2 + (w * ar) / 100) / 1000;
}

/** Linear interpolation of `s` at time t; null outside its range or across a reading gap. */
function at(s: Pt[], t: number): number | null {
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1]!;
    const b = s[i]!;
    if (t < a.t) return null;
    if (t <= b.t) return b.t - a.t > MAX_GAP_MS ? null : b.t === a.t ? b.v : a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
  }
  return null;
}

/**
 * Least-squares speed/RPM ratio through the origin (km/h per rpm) over readings ≥ MIN_SPEED_KMH. Not ok when any
 * reading is more than 1 km/h + RATIO_TOL off the fit: a gear change, kickdown or clutch/converter slip.
 */
export function fitRatio(rpm: number[], kmh: number[]): { ok: boolean; k: number; worstKmh: number; reason?: string } {
  let num = 0;
  let den = 0;
  const used: number[] = [];
  rpm.forEach((r, i) => {
    if (kmh[i]! < MIN_SPEED_KMH || r <= 0) return;
    num += kmh[i]! * r;
    den += r * r;
    used.push(i);
  });
  if (used.length < MIN_FIT_POINTS) return { ok: false, k: 0, worstKmh: 0, reason: `too few readings above ${MIN_SPEED_KMH} km/h` };
  const k = num / den;
  let worstKmh = 0;
  let ok = true;
  for (const i of used) {
    const err = Math.abs(kmh[i]! - k * rpm[i]!);
    worstKmh = Math.max(worstKmh, err);
    if (err > 1 + RATIO_TOL * k * rpm[i]!) ok = false;
  }
  return ok ? { ok, k, worstKmh } : { ok, k, worstKmh, reason: "the speed/RPM ratio changed during the pull (gear change or clutch slip?)" };
}

/**
 * Savitzky–Golay-style smoothing for uneven sample times: a least-squares quadratic in real time around each
 * point (± HALF_WINDOW_S, widened to at least 5 points). Returns the fitted value and slope (per second).
 */
export function smoothDeriv(tS: number[], y: number[], half = HALF_WINDOW_S): { y: number[]; dy: number[] } {
  const n = tS.length;
  if (n < MIN_FIT_POINTS) throw new Error(`smoothDeriv needs at least ${MIN_FIT_POINTS} points`);
  const out = { y: [] as number[], dy: [] as number[] };
  for (let i = 0; i < n; i++) {
    let lo = i;
    let hi = i;
    while (lo > 0 && tS[i]! - tS[lo - 1]! <= half) lo--;
    while (hi < n - 1 && tS[hi + 1]! - tS[i]! <= half) hi++;
    while (hi - lo + 1 < MIN_FIT_POINTS) {
      if (lo === 0) hi++;
      else if (hi === n - 1) lo--;
      else if (tS[i]! - tS[lo - 1]! < tS[hi + 1]! - tS[i]!) lo--;
      else hi++;
    }
    // Normal equations for y = c0 + c1·x + c2·x², x = t − tᵢ.
    const s = [0, 0, 0, 0, 0];
    const r = [0, 0, 0];
    for (let j = lo; j <= hi; j++) {
      const x = tS[j]! - tS[i]!;
      let p = 1;
      for (let k = 0; k < 5; k++) {
        s[k]! += p;
        if (k < 3) r[k]! += p * y[j]!;
        p *= x;
      }
    }
    const [c0, c1] = solve3(
      [
        [s[0]!, s[1]!, s[2]!],
        [s[1]!, s[2]!, s[3]!],
        [s[2]!, s[3]!, s[4]!],
      ],
      r,
    );
    out.y.push(c0);
    out.dy.push(c1);
  }
  return out;
}

/** Cramer's rule; the window always has ≥ 3 distinct times, so the matrix is regular. */
function solve3(m: number[][], r: number[]): [number, number, number] {
  const det = (a: number[][]) =>
    a[0]![0]! * (a[1]![1]! * a[2]![2]! - a[1]![2]! * a[2]![1]!) -
    a[0]![1]! * (a[1]![0]! * a[2]![2]! - a[1]![2]! * a[2]![0]!) +
    a[0]![2]! * (a[1]![0]! * a[2]![1]! - a[1]![1]! * a[2]![0]!);
  const d = det(m);
  const col = (c: number) => det(m.map((row, i) => row.map((v, j) => (j === c ? r[i]! : v))));
  return [col(0) / d, col(1) / d, col(2) / d];
}

export interface DynoPoint {
  rpm: number;
  w: number; // wheel power
  nm: number; // engine-equivalent torque, P / ω_engine
  n: number; // tractive force at the wheels, P / v
}

export interface DynoResult {
  kmhPer1000: number; // fitted gear ratio
  worstKmh: number; // largest reading-to-fit gap
  rpmHz: number;
  speedHz: number;
  durationS: number;
  curve: DynoPoint[];
  peakPower: { w: number; rpm: number };
  peakTorque: { nm: number; rpm: number };
}

export interface Pull {
  rpm: Pt[];
  speed: Pt[];
}

/** What a run was computed with, saved alongside it. */
export interface DynoInputs {
  curbKg: number;
  extraKg: number;
  /** Demo mode without a Garage weight: the simulator's demo mass. */
  demoMass: boolean;
  losses: Losses | null;
  rhoKgM3: number;
  tyre: string;
  tyreRadiusM: number | null;
}

export interface DynoRun extends DynoResult {
  at: number; // epoch ms the pull started
  vin: string | null;
  inputs: DynoInputs;
  raw: Pull;
}

const hz = (s: Pt[]) => (s.length > 1 ? (s.length - 1) / ((s[s.length - 1]!.t - s[0]!.t) / 1000) : 0);

/** The power/torque estimate for one pull, or why it can't be trusted. */
export function analyzePull(p: Pull, massKg: number, losses: Losses | null): { ok: true; result: DynoResult } | { ok: false; reason: string } {
  const pairs = p.rpm.flatMap((r) => {
    const kmh = at(p.speed, r.t);
    return kmh === null ? [] : [{ t: r.t, rpm: r.v, kmh }];
  });
  const fit = fitRatio(
    pairs.map((x) => x.rpm),
    pairs.map((x) => x.kmh),
  );
  if (!fit.ok) return { ok: false, reason: fit.reason! };
  const used = pairs.filter((x) => x.kmh >= MIN_SPEED_KMH);
  // Speed from RPM: 0.25 rpm steps instead of whole km/h.
  const sm = smoothDeriv(
    used.map((x) => x.t / 1000),
    used.map((x) => (fit.k * x.rpm) / 3.6),
  );
  // The first and last half-window can't be fitted symmetrically and smear the throttle step: left out.
  const from = used[0]!.t + HALF_WINDOW_S * 1000;
  const to = used[used.length - 1]!.t - HALF_WINDOW_S * 1000;
  const curve = used.flatMap((x, i) => {
    if (x.t < from || x.t > to) return [];
    const v = sm.y[i]!;
    const w = powerW(massKg, v, sm.dy[i]!, losses);
    const rpm = (v * 3.6) / fit.k;
    return [{ rpm, w, nm: w / ((2 * Math.PI * rpm) / 60), n: w / v }];
  });
  if (curve.length < MIN_FIT_POINTS) return { ok: false, reason: "the pull was too short" };
  const top = (f: (x: DynoPoint) => number) => curve.reduce((a, b) => (f(b) > f(a) ? b : a));
  const pw = top((x) => x.w);
  const tq = top((x) => x.nm);
  return {
    ok: true,
    result: {
      kmhPer1000: fit.k * 1000,
      worstKmh: fit.worstKmh,
      rpmHz: hz(p.rpm),
      speedHz: hz(p.speed),
      durationS: (used[used.length - 1]!.t - used[0]!.t) / 1000,
      curve,
      peakPower: { w: pw.w, rpm: pw.rpm },
      peakTorque: { nm: tq.nm, rpm: tq.rpm },
    },
  };
}

/**
 * Hands-free pull spotter, the dyno's PerfTimer. While armed it follows RPM from its last low point; when RPM falls
 * DROP_RPM below the peak, the climb up to the peak is handed back (if long enough to be a pull) and it starts over.
 */
export class DynoRecorder {
  armed = false;
  private rpm: Pt[] = [];
  private speed: Pt[] = [];

  arm() {
    this.armed = true;
    this.rpm = [];
    this.speed = [];
  }

  disarm() {
    this.armed = false;
    this.rpm = [];
    this.speed = [];
  }

  /** The climb so far: [start rpm, peak rpm], or null. */
  get climb(): [number, number] | null {
    if (this.rpm.length < 2) return null;
    return [this.rpm[0]!.v, Math.max(...this.rpm.map((p) => p.v))];
  }

  addSpeed(p: Pt) {
    if (!this.armed) return;
    this.speed.push(p);
    const from = (this.rpm[0]?.t ?? p.t) - MAX_GAP_MS;
    while (this.speed.length > 2 && this.speed[1]!.t < from) this.speed.shift();
  }

  /** Feed an RPM reading; returns a finished pull when one ends. */
  addRpm(p: Pt): Pull | null {
    if (!this.armed) return null;
    const run = this.rpm;
    const last = run[run.length - 1];
    if (!last || p.t - last.t > MAX_GAP_MS) {
      this.rpm = [p];
      return null;
    }
    let peak = 0;
    for (let i = 1; i < run.length; i++) if (run[i]!.v >= run[peak]!.v) peak = i;
    if (p.v < run[peak]!.v - DROP_RPM) {
      this.rpm = [p];
      return this.cut(run.slice(0, peak + 1));
    }
    if (p.v <= run[0]!.v) {
      this.rpm = [p]; // a new low point: the climb starts here
      return null;
    }
    run.push(p);
    while (p.t - run[0]!.t > MAX_PULL_MS) run.shift();
    return null;
  }

  private cut(climb: Pt[]): Pull | null {
    if (climb.length < 2) return null;
    // The pull starts after the last moment RPM wasn't climbing (cruising or idling before flooring it).
    let start = 0;
    for (let i = 0, j = 0; i < climb.length; i++) {
      while (j < climb.length - 1 && climb[j]!.t - climb[i]!.t < RISE_WINDOW_MS) j++;
      const dt = (climb[j]!.t - climb[i]!.t) / 1000;
      if (dt * 1000 < RISE_WINDOW_MS) break;
      if ((climb[j]!.v - climb[i]!.v) / dt < MIN_RISE_RPM_S) start = i + 1;
    }
    // The window can still hold the tail of the steady part: start at the first reading that has climbed (the
    // throttle opened somewhere between it and the one before, so that one is still steady).
    const rate = (i: number) => (climb[i]!.v - climb[i - 1]!.v) / ((climb[i]!.t - climb[i - 1]!.t) / 1000);
    start = Math.max(start, 1);
    while (start < climb.length - 1 && !(rate(start) >= MIN_RISE_RPM_S)) start++;
    const rpm = climb.slice(start);
    const a = rpm[0]!;
    const b = rpm[rpm.length - 1]!;
    if (b.v - a.v < MIN_SPAN_RPM || (b.t - a.t) / 1000 < MIN_DURATION_S) return null;
    return { rpm, speed: this.speed.filter((s) => s.t >= a.t - MAX_GAP_MS && s.t <= b.t + MAX_GAP_MS) };
  }
}

// Display. Exact definitional factors: mechanical hp = 550 ft·lbf/s, lbf = 4.4482216152605 N, ft = 0.3048 m.
const HP_W = 745.69987158227022;
const LBFT_NM = 1.3558179483314004;
const LBF_N = 4.4482216152605;

export const powerUnit = (u: UnitSystem) => (u === "imperial" ? "hp" : "kW");
export const torqueUnit = (u: UnitSystem) => (u === "imperial" ? "lb·ft" : "N·m");
export const forceUnit = (u: UnitSystem) => (u === "imperial" ? "lbf" : "N");
export const showPower = (w: number, u: UnitSystem) => (u === "imperial" ? w / HP_W : w / 1000);
export const showTorque = (nm: number, u: UnitSystem) => (u === "imperial" ? nm / LBFT_NM : nm);
export const showForce = (n: number, u: UnitSystem) => (u === "imperial" ? n / LBF_N : n);
