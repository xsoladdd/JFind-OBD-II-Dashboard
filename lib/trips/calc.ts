import type { FuelSource } from "./fuel";

/** Readings further apart than this (a dropout, a reconnect) aren't integrated across. */
export const MAX_GAP_MS = 5000;

export interface TripStats {
  distanceKm: number;
  movingMs: number;
  idleMs: number;
  fuelL: number;
  /** "estimate" as soon as any MAF-estimated flow went in; null when no fuel data at all. */
  fuelSource: FuelSource | null;
}

const H = 3_600_000;

/** Trip computer accumulator: trapezoidal integration of 010D speed and fuel flow over reading timestamps. */
export class TripCalc {
  stats: TripStats = { distanceKm: 0, movingMs: 0, idleMs: 0, fuelL: 0, fuelSource: null };
  private speed: { t: number; v: number } | null = null;
  private flow: { t: number; v: number } | null = null;

  addSpeed(t: number, kmh: number) {
    const p = this.speed;
    this.speed = { t, v: kmh };
    const dt = p ? t - p.t : 0;
    if (!p || dt <= 0 || dt > MAX_GAP_MS) return;
    this.stats.distanceKm += (((p.v + kmh) / 2) * dt) / H;
    if (p.v > 0 || kmh > 0) this.stats.movingMs += dt;
    else this.stats.idleMs += dt;
  }

  addFlow(t: number, lph: number, source: FuelSource) {
    const p = this.flow;
    this.flow = { t, v: lph };
    if (this.stats.fuelSource !== "estimate") this.stats.fuelSource = source;
    const dt = p ? t - p.t : 0;
    if (!p || dt <= 0 || dt > MAX_GAP_MS) return;
    this.stats.fuelL += (((p.v + lph) / 2) * dt) / H;
  }
}

/** Average speed over moving time, km/h. */
export const avgSpeed = (s: TripStats) => (s.movingMs > 0 ? s.distanceKm / (s.movingMs / H) : 0);
/** L/100 km, or null when too little distance for a meaningful number. */
export const avgEconomy = (s: TripStats) => (s.fuelSource && s.distanceKm >= 0.1 ? (s.fuelL / s.distanceKm) * 100 : null);
/** L/100 km while moving; null when stopped (show L/h instead). */
export const instantEconomy = (lph: number, kmh: number) => (kmh > 0 ? (lph / kmh) * 100 : null);
