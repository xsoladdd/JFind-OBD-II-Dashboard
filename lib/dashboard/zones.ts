/**
 * Warning-zone thresholds for the gauges, in raw metric units.
 * General guidance only, NOT from SAE J1979 or any standard: normal values differ per car (README [verify]).
 * The RPM redline is a user setting (useRedline in lib/store/settings.ts) because it is car-specific.
 */
export const COOLANT_HOT_C = 110; // estimate: many petrol engines run ~90–105 °C when warm
export const FUEL_LOW_PCT = 12; // estimate: roughly where many low-fuel lamps come on
/** Shift lights start at this fraction of the redline (a display choice, not a car fact). */
export const SHIFT_START = 0.75;
