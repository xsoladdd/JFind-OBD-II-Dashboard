import type { FuelType } from "../garage/model";

/*
 * Approximations for the MAF fuel-flow estimate, kept in one place. [verify] both before trusting the number.
 * - 14.7:1 is the commonly cited stoichiometric air-fuel ratio for petrol (e.g. Bosch Automotive Handbook).
 *   Ethanol blends (E10) run leaner, about 14.1–14.4:1, and closed-loop control isn't always at stoichiometric.
 * - 745 g/L sits inside the EN 228 petrol density range (720–775 kg/m³ at 15 °C); it varies with blend and temperature.
 * Diesel has no fixed AFR (lean, load-dependent), so there is deliberately no diesel estimate.
 */
export const PETROL_STOICH_AFR = 14.7;
export const PETROL_DENSITY_G_PER_L = 745;

export type FuelSource = "015E" | "estimate";
export interface FuelFlow {
  lph: number;
  source: FuelSource;
}

/** g/s of intake air → L/h of petrol at stoichiometric. */
export const mafToLph = (gps: number) => (gps * 3600) / (PETROL_STOICH_AFR * PETROL_DENSITY_G_PER_L);

/**
 * Fuel flow from whatever the car offers: 015E (engine fuel rate, L/h) is used as-is; otherwise a MAF estimate,
 * for petrol only. Returns null when neither applies (diesel or "other" without 015E, no car profile, no MAF).
 */
export function fuelFlow(r: { fuelRate?: number; maf?: number; fuelType?: FuelType | null }): FuelFlow | null {
  if (r.fuelRate !== undefined) return { lph: r.fuelRate, source: "015E" };
  if (r.maf !== undefined && r.fuelType === "petrol") return { lph: mafToLph(r.maf), source: "estimate" };
  return null;
}
