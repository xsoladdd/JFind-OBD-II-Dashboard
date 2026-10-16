// All app data lives as plain files in a folder the user picked (File System Access API). See docs/storage.md.
// The only thing kept in the browser is the folder handle (IndexedDB), so the user picks the folder once.
import { create } from "zustand";

// Chromium-only parts of the API that TypeScript's DOM lib doesn't declare.
type Perm = "granted" | "denied" | "prompt";
declare global {
  interface FileSystemHandle {
    queryPermission(o: { mode: "readwrite" }): Promise<Perm>;
    requestPermission(o: { mode: "readwrite" }): Promise<Perm>;
  }
  interface FileSystemDirectoryHandle {
    values(): AsyncIterable<FileSystemHandle>;
  }
  function showDirectoryPicker(o: { id?: string; mode: "readwrite"; startIn?: string }): Promise<FileSystemDirectoryHandle>;
}

export type FolderStatus = "unsupported" | "unlinked" | "needs-permission" | "ready";

interface FolderState {
  status: FolderStatus;
  folderName: string | null;
  link: () => Promise<void>;
  regrant: () => Promise<void>;
  unlink: () => Promise<void>;
}

export class FolderUnavailableError extends Error {
  constructor() {
    super("No folder linked, or access to it not granted");
    this.name = "FolderUnavailableError";
  }
}

let root: FileSystemDirectoryHandle | null = null;

const supported = () => typeof globalThis.showDirectoryPicker === "function";

/** Remembers the one folder handle; IndexedDB is the only browser store that can hold it. Nothing else goes here. */
function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no IndexedDB"));
    const open = indexedDB.open("obd-dash-folder", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("handle");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("handle", mode);
      const req = fn(tx.objectStore("handle"));
      tx.oncomplete = () => (db.close(), resolve(req.result));
      tx.onerror = tx.onabort = () => (db.close(), reject(tx.error ?? req.error));
    };
  });
}

async function adopt(h: FileSystemDirectoryHandle, ask: boolean) {
  const mode = { mode: "readwrite" } as const;
  let p = await h.queryPermission(mode).catch((): Perm => "prompt");
  // requestPermission throws without a user gesture; that just leaves us at "needs-permission".
  if (p !== "granted" && ask) p = await h.requestPermission(mode).catch((): Perm => "prompt");
  root = h;
  useFolder.setState({ folderName: h.name, status: p === "granted" ? "ready" : "needs-permission" });
}

export const useFolder = create<FolderState>((set) => ({
  status: "unlinked",
  folderName: null,

  async link() {
    if (!supported()) return;
    let h: FileSystemDirectoryHandle;
    try {
      h = await showDirectoryPicker({ id: "obd-dash", mode: "readwrite", startIn: "documents" });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return; // user closed the picker
      throw e;
    }
    await idb("readwrite", (s) => s.put(h, "root")).catch(() => {}); // not remembered: the user picks again next visit
    await adopt(h, true);
  },

  async regrant() {
    if (root) await adopt(root, true);
  },

  async unlink() {
    root = null;
    set({ status: supported() ? "unlinked" : "unsupported", folderName: null });
    await idb("readwrite", (s) => s.delete("root")).catch(() => {});
  },
}));

/** Runs once in the browser: feature-detects, then restores the remembered folder (without prompting). */
export async function initFolder() {
  if (!supported()) return useFolder.setState({ status: "unsupported" });
  const h = await idb<FileSystemDirectoryHandle | undefined>("readonly", (s) => s.get("root")).catch(() => undefined);
  if (h) await adopt(h, false);
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ROOT_FILE = /^settings\.json$|^settings-broken-[A-Za-z0-9-]+\.json$/;
// The only top-level folders the app may write in; a feature that saves files adds its folder here.
const DIRS = ["scans", "logs", "trips"];

/** The only paths the app may touch in the user's folder: settings.json, its broken-file backups and DIRS/<file>. */
export function checkPath(path: string): string[] {
  const parts = path.split("/");
  const ok =
    parts.every((p) => SEGMENT.test(p)) &&
    (parts.length === 1 ? ROOT_FILE.test(path) : parts.length === 2 && DIRS.includes(parts[0]!));
  if (!ok) throw new Error(`Refusing unsafe path: ${JSON.stringify(path)}`);
  return parts;
}

function ready(): FileSystemDirectoryHandle {
  if (!root || useFolder.getState().status !== "ready") throw new FolderUnavailableError();
  return root;
}

const notFound = (e: unknown) => e instanceof Error && (e.name === "NotFoundError" || e.name === "TypeMismatchError");

async function fileHandle(path: string, create: boolean) {
  const parts = checkPath(path);
  const name = parts.pop()!;
  let dir = ready();
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create });
  return { dir, name, file: () => dir.getFileHandle(name, { create }) };
}

// One operation at a time, so two appends to the same file can't overwrite each other's swap file
// and a read always sees the writes queued before it.
let chain: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
};

/** Replaces the file atomically: createWritable writes a swap file that only replaces the original on close(). */
export async function writeText(path: string, text: string): Promise<void> {
  checkPath(path);
  ready();
  return serial(async () => {
    const w = await (await (await fileHandle(path, true)).file()).createWritable();
    await w.write(text);
    await w.close();
  });
}

export async function appendText(path: string, text: string): Promise<void> {
  checkPath(path);
  ready();
  return serial(async () => {
    const fh = await (await fileHandle(path, true)).file();
    const size = (await fh.getFile()).size;
    const w = await fh.createWritable({ keepExistingData: true });
    await w.seek(size);
    await w.write(text);
    await w.close();
  });
}

/** null when the file (or its folder) doesn't exist. */
export async function readText(path: string): Promise<string | null> {
  checkPath(path);
  ready();
  return serial(async () => {
    try {
      return await (await (await (await fileHandle(path, false)).file()).getFile()).text();
    } catch (e) {
      if (notFound(e)) return null;
      throw e;
    }
  });
}

export async function listFiles(dir: string): Promise<{ name: string; size: number; lastModified: number }[]> {
  if (!DIRS.includes(dir)) throw new Error(`Refusing unsafe path: ${JSON.stringify(dir)}`);
  ready();
  return serial(async () => {
    let d: FileSystemDirectoryHandle;
    try {
      d = await ready().getDirectoryHandle(dir);
    } catch (e) {
      if (notFound(e)) return [];
      throw e;
    }
    const out: { name: string; size: number; lastModified: number }[] = [];
    for await (const h of d.values()) {
      if (h.kind !== "file" || !SEGMENT.test(h.name)) continue;
      const f = await (h as FileSystemFileHandle).getFile();
      out.push({ name: h.name, size: f.size, lastModified: f.lastModified });
    }
    return out;
  });
}

/** Only files inside DIRS (never settings.json): this is for explicit deletes from History or Trips. */
export async function removeFile(path: string): Promise<void> {
  if (checkPath(path).length !== 2) throw new Error(`Refusing to delete ${JSON.stringify(path)}`);
  ready();
  return serial(async () => {
    const { dir, name } = await fileHandle(path, false);
    await dir.removeEntry(name);
  });
}

/** "2026-10-16T12-30-05Z": an ISO time that is safe in a file name (used by scans/, logs/, trips/). */
export const fileStamp = (d = new Date()) => d.toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
