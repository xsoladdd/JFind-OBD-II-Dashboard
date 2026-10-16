import { create } from "zustand";
import { clearCodes, readScan, type ClearOutcome, type Scan } from "../diagnostics/scan";
import { getClient } from "./connection";

interface DiagnosticsState {
  /** The latest scan of the connected car. */
  live: Scan | null;
  /** A history scan the user opened; shown instead of `live` until closed. */
  viewing: Scan | null;
  reading: boolean;
  error: string;
  clearing: boolean;
  outcome: ClearOutcome | null;
  clearError: string;
  read: () => Promise<void>;
  clear: () => Promise<void>;
  resetClear: () => void;
  open: (scan: Scan | null) => void;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const useDiagnostics = create<DiagnosticsState>((set) => {
  const keep = async (scan: Scan) => {
    set({ live: scan, viewing: null });
  };

  return {
    live: null,
    viewing: null,
    reading: false,
    error: "",
    clearing: false,
    outcome: null,
    clearError: "",

    async read() {
      const c = getClient();
      if (!c?.isOpen) return set({ error: "Not connected." });
      set({ reading: true, error: "" });
      try {
        await keep(await readScan(c));
      } catch (e) {
        set({ error: errMsg(e) });
      } finally {
        set({ reading: false });
      }
    },

    async clear() {
      const c = getClient();
      if (!c?.isOpen) return set({ clearError: "Not connected." });
      set({ clearing: true, outcome: null, clearError: "" });
      try {
        const outcome = await clearCodes(c);
        set({ outcome });
        if (outcome.status === "cleared") await keep(outcome.after);
      } catch (e) {
        set({ clearError: errMsg(e) });
      } finally {
        set({ clearing: false });
      }
    },

    resetClear: () => set({ outcome: null, clearError: "" }),

    open: (scan) => set({ viewing: scan }),
  };
});
