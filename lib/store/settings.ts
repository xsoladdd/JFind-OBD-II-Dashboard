import type { AlertRule } from "../alerts/rules";
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
export const useTripAutoRecord = () => useSetting<boolean>("trips.autoRecord", true);
export const getTripAutoRecord = () => getSetting<boolean>("trips.autoRecord", true);
export const useTripStopMin = () => useSetting<number>("trips.stopTimeoutMin", DEFAULT_TRIP_STOP_MIN);
export const getTripStopMin = () => getSetting<number>("trips.stopTimeoutMin", DEFAULT_TRIP_STOP_MIN);
/** Location is sensitive: off unless the user turns it on. */
export const useTripGps = () => useSetting<boolean>("trips.gps", false);
export const getTripGps = () => getSetting<boolean>("trips.gps", false);
export const usePerfNoticeSeen = () => useSetting<boolean>("trips.perfNoticeSeen", false);
