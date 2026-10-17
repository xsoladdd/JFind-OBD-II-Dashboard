import { useMemo } from "react";
import type { AlertRule } from "../alerts/rules";
import { sanitizeProfiles, type AdapterProfile } from "../connect/profiles";
import { sanitizeCustomPids, type CustomPid } from "../obd/custom";
import { EMPTY_LAYOUTS, type CustomLayouts } from "../dashboard/layouts";
import type { UnitSystem } from "../units";
import { getSetting, setSetting, useSetting } from "../storage/settings";
import { EXAMPLE_CDA_M2, EXAMPLE_CRR } from "../trips/dyno";

export type ThemeId = "drive" | "classic" | "sport" | "minimal" | "engineer" | "hud" | "custom";

/** Car-specific; the default is a placeholder the user should change (README [verify]). */
export const DEFAULT_REDLINE = 6500;

// Each persisted setting lives behind one hook, so the storage backend is swapped in one place.
export const useUnits = () => useSetting<UnitSystem>("units", "metric");
export const getUnits = () => getSetting<UnitSystem>("units", "metric");
export const useTheme = () => useSetting<ThemeId>("dashboard.theme", "drive");
export const useRedline = () => useSetting<number>("dashboard.redlineRpm", DEFAULT_REDLINE);
export const useHudMirror = () => useSetting<boolean>("dashboard.hudMirror", false);

// Driving (DESIGN.md "Driving", docs/dashboard.md).
/** Lower-luminance tokens for night driving, app-wide. */
export const useNightDim = () => useSetting<boolean>("display.nightDim", false);
/** The Drive layout's (at most 2) extra values under speed and RPM. Default: coolant and fuel level. */
export const DRIVE_EXTRAS_MAX = 2;
const DEFAULT_EXTRAS = ["0105", "012F"];
const extrasCache = new WeakMap<object, string[]>();
/** settings.json is hand-editable: keep unique non-empty strings, at most DRIVE_EXTRAS_MAX, as a stable reference. */
export function sanitizeDriveExtras(v: unknown): string[] {
  if (!Array.isArray(v)) return DEFAULT_EXTRAS;
  if (!extrasCache.has(v))
    extrasCache.set(v, [...new Set(v.filter((x): x is string => typeof x === "string" && x !== ""))].slice(0, DRIVE_EXTRAS_MAX));
  return extrasCache.get(v)!;
}
export const useDriveExtras = (): [string[], (v: string[]) => void] => {
  const [v, set] = useSetting<string[]>("dashboard.driveExtras", DEFAULT_EXTRAS);
  return [sanitizeDriveExtras(v), set];
};
/** Set by "Start driving": a later Connect tap on the connect screen goes straight to the drive view. */
export const useOpenAfterConnect = () => useSetting<boolean>("drive.openAfterConnect", false);
/** The last Bluetooth adapter connected, for a one-tap reconnect via navigator.bluetooth.getDevices(). */
export interface LastAdapter {
  id: string;
  name: string;
}
const lastAdapter = (v: unknown): LastAdapter | null =>
  v && typeof v === "object" && typeof (v as LastAdapter).id === "string" && (v as LastAdapter).id
    ? { id: (v as LastAdapter).id, name: typeof (v as LastAdapter).name === "string" ? (v as LastAdapter).name : "" }
    : null;
export const useLastAdapter = () => lastAdapter(useSetting<unknown>("ble.lastAdapter", null)[0]);
export const getLastAdapter = () => lastAdapter(getSetting<unknown>("ble.lastAdapter", null));
export const setLastAdapter = (v: LastAdapter) => setSetting("ble.lastAdapter", v);
const NO_RULES: AlertRule[] = []; // a stable fallback reference for useSyncExternalStore
// settings.json is hand-editable: a value of the wrong shape falls back to the default instead of crashing the page.
const layouts = (v: CustomLayouts) => (v && Array.isArray(v.layouts) ? v : EMPTY_LAYOUTS);
const rules = (v: AlertRule[]) => (Array.isArray(v) ? v : NO_RULES);
export const useCustomLayouts = (): [CustomLayouts, (v: CustomLayouts) => void] => {
  const [v, set] = useSetting<CustomLayouts>("dashboard.customLayouts", EMPTY_LAYOUTS);
  return [layouts(v), set];
};
export const getCustomLayouts = () => layouts(getSetting<CustomLayouts>("dashboard.customLayouts", EMPTY_LAYOUTS));
export const useAlertRules = (): [AlertRule[], (v: AlertRule[]) => void] => {
  const [v, set] = useSetting<AlertRule[]>("alerts.rules", NO_RULES);
  return [rules(v), set];
};
export const getAlertRules = () => rules(getSetting<AlertRule[]>("alerts.rules", NO_RULES));

// Trips (docs/trips.md). The stop timeout is an app default, not a standard.
export const DEFAULT_TRIP_STOP_MIN = 5;
const stopMin = (v: number) => (typeof v === "number" && v >= 1 && v <= 120 ? v : DEFAULT_TRIP_STOP_MIN);
export const useTripAutoRecord = () => useSetting<boolean>("trips.autoRecord", true);
export const getTripAutoRecord = () => getSetting<boolean>("trips.autoRecord", true) !== false;
export const useTripStopMin = (): [number, (v: number) => void] => {
  const [v, set] = useSetting<number>("trips.stopTimeoutMin", DEFAULT_TRIP_STOP_MIN);
  return [stopMin(v), set];
};
export const getTripStopMin = () => stopMin(getSetting<number>("trips.stopTimeoutMin", DEFAULT_TRIP_STOP_MIN));
/** Location is sensitive: off unless the user turns it on (anything but `true` in settings.json counts as off). */
export const useTripGps = (): [boolean, (v: boolean) => void] => {
  const [v, set] = useSetting<boolean>("trips.gps", false);
  return [v === true, set];
};
export const getTripGps = () => getSetting<boolean>("trips.gps", false) === true;
export const usePerfNoticeSeen = () => useSetting<boolean>("trips.perfNoticeSeen", false);

// Adapter profiles (docs/connection-helper.md): named UUID + write-method sets. The active settings stay in "ble.uuids".
const NO_PROFILES: AdapterProfile[] = [];
export const useAdapterProfiles = (): [AdapterProfile[], (v: AdapterProfile[]) => void] => {
  const [v, set] = useSetting<unknown>("ble.profiles", NO_PROFILES);
  return [useMemo(() => sanitizeProfiles(v), [v]), set];
};

// Custom PIDs (docs/custom-pids.md). Sanitized once per stored array so hook consumers get a stable reference.
const NO_CUSTOM: CustomPid[] = [];
const sane = new WeakMap<object, CustomPid[]>();
const customPids = (v: unknown): CustomPid[] => {
  if (!Array.isArray(v)) return NO_CUSTOM;
  if (!sane.has(v)) sane.set(v, sanitizeCustomPids(v));
  return sane.get(v)!;
};
export const useCustomPids = (): [CustomPid[], (v: CustomPid[]) => void] => {
  const [v, set] = useSetting<CustomPid[]>("pids.custom", NO_CUSTOM);
  return [customPids(v), set];
};
export const getCustomPids = () => customPids(getSetting<CustomPid[]>("pids.custom", NO_CUSTOM));

// Dyno (docs/dyno.md). Crr and CdA start at the typical example values in lib/trips/dyno.ts [verify]; extra load at 0.
export interface DynoSettings {
  extraKg: number;
  losses: boolean;
  crr: number;
  cdaM2: number;
  tyre: string;
}
export const DEFAULT_DYNO: DynoSettings = { extraKg: 0, losses: true, crr: EXAMPLE_CRR, cdaM2: EXAMPLE_CDA_M2, tyre: "" };
const nonNeg = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
const dyno = (v: DynoSettings): DynoSettings => {
  const ok = v && typeof v === "object";
  return {
    extraKg: nonNeg(ok && v.extraKg, DEFAULT_DYNO.extraKg),
    losses: ok ? v.losses !== false : DEFAULT_DYNO.losses,
    crr: nonNeg(ok && v.crr, DEFAULT_DYNO.crr),
    cdaM2: nonNeg(ok && v.cdaM2, DEFAULT_DYNO.cdaM2),
    tyre: ok && typeof v.tyre === "string" ? v.tyre : DEFAULT_DYNO.tyre,
  };
};
export const useDynoSettings = (): [DynoSettings, (v: DynoSettings) => void] => {
  const [v, set] = useSetting<DynoSettings>("dyno.inputs", DEFAULT_DYNO);
  return [dyno(v), set];
};
