import { create } from "zustand";
import type { AlertRule } from "../alerts/rules";

/** A rule that is firing right now (written by lib/alerts/engine.ts, shown by the shell's AlertIndicator). */
export interface ActiveAlert {
  rule: AlertRule;
  value: number; // raw metric, at the moment it fired
  t: number;
  acked: boolean;
}

interface AlertsState {
  active: ActiveAlert[];
  /** Date.now() until which firing alerts make no toast, sound or vibration. 0 = not muted. */
  mutedUntil: number;
  mute: (minutes: number) => void;
  unmute: () => void;
  ackAll: () => void;
}

let unmuteTimer: ReturnType<typeof setTimeout> | undefined;

export const useAlerts = create<AlertsState>((set) => ({
  active: [],
  mutedUntil: 0,
  mute: (minutes) => {
    clearTimeout(unmuteTimer);
    unmuteTimer = setTimeout(() => set({ mutedUntil: 0 }), minutes * 60_000); // so the UI drops "muted" on time
    set({ mutedUntil: Date.now() + minutes * 60_000 });
  },
  unmute: () => {
    clearTimeout(unmuteTimer);
    set({ mutedUntil: 0 });
  },
  ackAll: () => set((s) => ({ active: s.active.map((a) => ({ ...a, acked: true })) })),
}));

/** Quick-mute choices offered in the shell and on /alerts (a UI choice). */
export const MUTE_MINUTES = [5, 15, 60];

export const isMuted = (now = Date.now()) => useAlerts.getState().mutedUntil > now;
