import { useMemo } from "react";
import type { AlertRule } from "../alerts/rules";
import { sanitizeProfiles, type AdapterProfile } from "../connect/profiles";
import { sanitizeCustomPids, type CustomPid } from "../obd/custom";
import { EMPTY_LAYOUTS, type CustomLayouts } from "../dashboard/layouts";
import type { UnitSystem } from "../units";
import { getSetting, useSetting } from "../storage/settings";

export type ThemeId = "classic" | "sport" | "minimal" | "engineer" | "hud" | "custom";

/** Car-specific; the default is a placeholder the user should change (README [verify]). */
export const DEFAULT_REDLINE = 6500;

// Each persisted setting lives behind one hook, so the storage backend is swapped in one place.
export const useUnits = () => useSetting<UnitSystem>("units", "metric");
export const getUnits = () => getSetting<UnitSystem>("units", "metric");
export const useTheme = () => useSetting<ThemeId>("dashboard.theme", "classic");
export const useRedline = () => useSetting<number>("dashboard.redlineRpm", DEFAULT_REDLINE);
export const useHudMirror = () => useSetting<boolean>("dashboard.hudMirror", false);
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
