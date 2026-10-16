import { create } from "zustand";

// Shared by any long or state-changing ELM operation (sets) and the Scheduler (reads).
export const usePollingPause = create<{ holds: number }>(() => ({ holds: 0 }));

export async function withPollingPaused<T>(fn: () => Promise<T>): Promise<T> {
  usePollingPause.setState((s) => ({ holds: s.holds + 1 }));
  try {
    return await fn();
  } finally {
    usePollingPause.setState((s) => ({ holds: s.holds - 1 }));
  }
}
