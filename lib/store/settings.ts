import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UnitSystem } from "../units";

export type ThemeId = "classic" | "sport" | "minimal" | "engineer" | "hud";

interface Settings {
  units: UnitSystem;
  theme: ThemeId;
  /** Car-specific; the default is a placeholder the user should change (README [verify]). */
  redlineRpm: number;
  hudMirror: boolean;
  update: (p: Partial<Omit<Settings, "update">>) => void;
}

export const DEFAULT_REDLINE = 6500;

// skipHydration: the shell calls useSettings.persist.rehydrate() after mount so SSR and first render match.
export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      units: "metric",
      theme: "classic",
      redlineRpm: DEFAULT_REDLINE,
      hudMirror: false,
      update: (p) => set(p),
    }),
    { name: "obd-dash.settings", skipHydration: true },
  ),
);
