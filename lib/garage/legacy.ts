// The garage used to live in IndexedDB ("obd-dash-garage"). This is the only code left that touches it, kept apart so the
// one-time migration to garage/garage.json can be tested and the old database is only ever read or deleted, never written.
import type { GarageData } from "./db";
import type { CarProfile, Reminder, ServiceEntry } from "./model";

const DB_NAME = "obd-dash-garage";

/** Opens the old database without creating it. null: it doesn't exist (or there is no IndexedDB). */
function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const req = indexedDB.open(DB_NAME);
    let absent = false;
    req.onupgradeneeded = () => {
      absent = true; // a version bump on open() means there was nothing: abort so no empty database is left behind
      req.transaction?.abort();
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => (absent ? resolve(null) : reject(req.error));
  });
}

const all = <T>(s: IDBObjectStore) =>
  new Promise<T[]>((resolve, reject) => {
    const r = s.getAll();
    r.onsuccess = () => resolve(r.result as T[]);
    r.onerror = () => reject(r.error);
  });

/** Everything in the old database, or null when it doesn't exist. Rejects when it exists but can't be read. */
export async function readLegacy(): Promise<GarageData | null> {
  const db = await open();
  if (!db) return null;
  try {
    const names = ["profiles", "services", "reminders"];
    if (!names.every((n) => db.objectStoreNames.contains(n))) return null;
    const tx = db.transaction(names, "readonly");
    const [profiles, services, reminders] = await Promise.all([
      all<CarProfile>(tx.objectStore("profiles")),
      all<ServiceEntry>(tx.objectStore("services")),
      all<Reminder>(tx.objectStore("reminders")),
    ]);
    return { profiles, services, reminders };
  } finally {
    db.close();
  }
}

export const deleteLegacy = () =>
  new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("The old garage database is open in another tab"));
  });
