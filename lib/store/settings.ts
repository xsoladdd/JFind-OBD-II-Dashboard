import type { AlertRule } from "../alerts/rules";
import { EMPTY_LAYOUTS, type CustomLayouts } from "../dashboard/layouts";
import type { UnitSystem } from "../units";
// One line to switch to the settings.json store: import from "../storage/settings" instead.
import { getSetting, useSetting } from "./localSettings";

export type ThemeId = "classic" | "sport" | "minimal" | "engineer" | "hud" | "custom";

/** Car-specific; the default is a placeholder the user should change (README [verify]). */
export const DEFAULT_REDLINE = 6500;

// Each persisted setting lives behind one hook, so the storage backend is swapped in one place.
export const useUnits = () => useSetting<UnitSystem>("units", "metric");
export const getUnits = () => getSetting<UnitSystem>("units", "metric");
export const useTheme = () => useSetting<ThemeId>("dashboard.theme", "classic");
export const useRedline = () => useSetting<number>("dashboard.redlineRpm", DEFAULT_REDLINE);
export const useHudMirror = () => useSetting<boolean>("dashboard.hudMirror", false);
export const useCustomLayouts = () => useSetting<CustomLayouts>("dashboard.customLayouts", EMPTY_LAYOUTS);
export const getCustomLayouts = () => getSetting<CustomLayouts>("dashboard.customLayouts", EMPTY_LAYOUTS);
const NO_RULES: AlertRule[] = []; // a stable fallback reference for useSyncExternalStore
export const useAlertRules = () => useSetting<AlertRule[]>("alerts.rules", NO_RULES);
export const getAlertRules = () => getSetting<AlertRule[]>("alerts.rules", NO_RULES);
