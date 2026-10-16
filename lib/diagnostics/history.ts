import type { Scan } from "./scan";

// This feature's own database, so its schema never collides with other features.
const DB = "obd-dash-scans";
const STORE = "scans";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "at" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** One request in its own transaction; resolves once the transaction has committed. */
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error ?? req.error);
    });
  } finally {
    db.close();
  }
}

export const saveScan = (scan: Scan) => run("readwrite", (s) => s.put(scan));
export const deleteScan = (at: number) => run("readwrite", (s) => s.delete(at));
// shortcut: loads every scan into memory; add a cursor + limit if histories grow to thousands.
export const listScans = async () => (await run<Scan[]>("readonly", (s) => s.getAll())).sort((a, b) => b.at - a.at);
