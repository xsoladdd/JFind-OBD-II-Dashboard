import { create } from "zustand";
import { buildHistory, loadScanFiles, type CarHistory } from "../diagnostics/history";
import { useFolder } from "../storage/folder";

interface CodeHistoryState {
  loading: boolean;
  error: string;
  cars: CarHistory[];
  /** Scan files in the folder that couldn't be used (damaged, foreign or unreadable). */
  skipped: number;
  /** Files the history was built from. */
  scanned: number;
  load: () => Promise<void>;
}

export const useCodeHistory = create<CodeHistoryState>((set) => ({
  loading: false,
  error: "",
  cars: [],
  skipped: 0,
  scanned: 0,

  async load() {
    if (useFolder.getState().status !== "ready") return set({ cars: [], skipped: 0, scanned: 0, error: "" });
    set({ loading: true, error: "" });
    try {
      const { files, skipped } = await loadScanFiles();
      set({ cars: buildHistory(files).cars, skipped, scanned: files.length });
    } catch (e) {
      set({ error: `Couldn't read the scans folder: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      set({ loading: false });
    }
  },
}));
