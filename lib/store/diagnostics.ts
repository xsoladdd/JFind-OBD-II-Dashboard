import { create } from "zustand";
import { clearCodes, readScan, type ClearOutcome, type Scan } from "../diagnostics/scan";
import { clearFile, parseScanFile, readFile, SCAN_DIR, scanFileName, type ScanFile } from "../diagnostics/scanFile";
import { listFiles, readText, useFolder, writeText } from "../storage/folder";
import { getClient } from "./connection";

type FileInfo = { name: string; size: number; lastModified: number };

interface DiagnosticsState {
  /** The latest scan of the connected car. */
  live: Scan | null;
  /** A saved scan opened via /diagnostics?scan=<file name>; shown instead of `live`. */
  viewing: { name: string; file: ScanFile } | null;
  viewError: string;
  reading: boolean;
  error: string;
  /** File name (in SCAN_DIR) the latest read or clear run was saved as. */
  savedAs: string;
  saveError: string;
  recent: FileInfo[];
  clearing: boolean;
  outcome: ClearOutcome | null;
  clearError: string;
  read: () => Promise<void>;
  clear: () => Promise<void>;
  resetClear: () => void;
  openFile: (name: string | null) => Promise<void>;
  loadRecent: () => Promise<void>;
}

const RECENT = 5;
// The ?scan= value becomes a path, so only a bare file name is accepted: no separators, no "..".
const SAFE_NAME = /^[A-Za-z0-9_-]+\.json$/;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const folderReady = () => useFolder.getState().status === "ready";

/** The scan the page shows: an opened file (a clear run shows its re-read) or the live one. */
export const shownScan = (s: Pick<DiagnosticsState, "viewing" | "live">): Scan | null =>
  s.viewing ? (s.viewing.file.kind === "read" ? s.viewing.file.scan : s.viewing.file.after) : s.live;

export const useDiagnostics = create<DiagnosticsState>((set, get) => {
  /** Without a ready folder nothing is saved; the page says so and the export downloads still work. */
  const save = async (file: ScanFile) => {
    set({ savedAs: "", saveError: "" });
    if (!folderReady()) return;
    try {
      // Names have 1 s resolution; a fast Demo read + clear can share one. Bump the name, never overwrite.
      let at = Date.parse(file.takenAt);
      while ((await readText(`${SCAN_DIR}/${scanFileName(at, file.vin)}`)) !== null) at += 1000;
      const name = scanFileName(at, file.vin);
      await writeText(`${SCAN_DIR}/${name}`, JSON.stringify(file, null, 2));
      set({ savedAs: name });
      await get().loadRecent();
    } catch (e) {
      set({ saveError: `Scan not saved: ${errMsg(e)}` });
    }
  };

  return {
    live: null,
    viewing: null,
    viewError: "",
    reading: false,
    error: "",
    savedAs: "",
    saveError: "",
    recent: [],
    clearing: false,
    outcome: null,
    clearError: "",

    async read() {
      const c = getClient();
      if (!c?.isOpen) return set({ error: "Not connected." });
      set({ reading: true, error: "" });
      try {
        const scan = await readScan(c);
        set({ live: scan });
        await save(readFile(scan));
      } catch (e) {
        set({ error: errMsg(e) });
      } finally {
        set({ reading: false });
      }
    },

    async clear() {
      const c = getClient();
      const before = get().live;
      if (!c?.isOpen) return set({ clearError: "Not connected." });
      if (!before) return set({ clearError: "Read the codes first." });
      set({ clearing: true, outcome: null, clearError: "" });
      try {
        const outcome = await clearCodes(c);
        set({ outcome });
        if (outcome.status === "cleared") {
          set({ live: outcome.after });
          await save(clearFile(before, outcome.after));
        }
      } catch (e) {
        set({ clearError: errMsg(e) });
      } finally {
        set({ clearing: false });
      }
    },

    resetClear: () => set({ outcome: null, clearError: "" }),

    async openFile(name) {
      if (!name) return set({ viewing: null, viewError: "" });
      if (!SAFE_NAME.test(name)) return set({ viewing: null, viewError: `"${name}" isn't a scan file name.` });
      if (!folderReady()) return set({ viewing: null, viewError: "Choose a folder (History page) to open saved scans." });
      try {
        const text = await readText(`${SCAN_DIR}/${name}`);
        if (text === null) return set({ viewing: null, viewError: `${name} isn't in the scans folder.` });
        set({ viewing: { name, file: parseScanFile(text) }, viewError: "" });
      } catch (e) {
        set({ viewing: null, viewError: `Couldn't open ${name}: ${errMsg(e)}` });
      }
    },

    async loadRecent() {
      if (!folderReady()) return set({ recent: [] });
      try {
        const files = await listFiles(SCAN_DIR);
        // Names start with the UTC timestamp, so name order is time order.
        const ours = files.filter((f) => SAFE_NAME.test(f.name)).sort((a, b) => b.name.localeCompare(a.name));
        set({ recent: ours.slice(0, RECENT) });
      } catch {
        set({ recent: [] }); // e.g. no scans/ folder yet
      }
    },
  };
});
