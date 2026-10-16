// Raw IndexedDB for the garage. Own database, so it never collides with other features' schemas.
import type { CarProfile, Reminder, ServiceEntry } from "./model";

const DB_NAME = "obd-dash-garage";
type StoreName = "profiles" | "services" | "reminders";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("profiles", { keyPath: "id" }).createIndex("vin", "vin");
      db.createObjectStore("services", { keyPath: "id" }).createIndex("carId", "carId");
      db.createObjectStore("reminders", { keyPath: "id" }).createIndex("carId", "carId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Runs fn inside one transaction over the given stores and resolves when it commits. */
async function tx<T>(names: StoreName[], fn: (s: Record<StoreName, IDBObjectStore>) => T | Promise<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(names, "readwrite");
      const stores = Object.fromEntries(names.map((n) => [n, t.objectStore(n)])) as Record<StoreName, IDBObjectStore>;
      let out: T;
      t.oncomplete = () => resolve(out);
      t.onerror = t.onabort = () => reject(t.error);
      Promise.resolve(fn(stores)).then((v) => (out = v), reject);
    });
  } finally {
    db.close();
  }
}

const all = <T>(s: IDBObjectStore) =>
  new Promise<T[]>((resolve, reject) => {
    const r = s.getAll();
    r.onsuccess = () => resolve(r.result as T[]);
    r.onerror = () => reject(r.error);
  });

export interface GarageData {
  profiles: CarProfile[];
  services: ServiceEntry[];
  reminders: Reminder[];
}

export const loadAll = (): Promise<GarageData> =>
  tx(["profiles", "services", "reminders"], async (s) => ({
    profiles: await all<CarProfile>(s.profiles),
    services: await all<ServiceEntry>(s.services),
    reminders: await all<Reminder>(s.reminders),
  }));

export const put = (store: StoreName, value: CarProfile | ServiceEntry | Reminder) =>
  tx([store], (s) => void s[store].put(value));

export const remove = (store: StoreName, id: string) => tx([store], (s) => void s[store].delete(id));

/** Deletes a car and everything keyed to it, atomically. */
export const deleteCar = (id: string) =>
  tx(["profiles", "services", "reminders"], async (s) => {
    s.profiles.delete(id);
    for (const name of ["services", "reminders"] as const) {
      for (const row of await all<{ id: string; carId: string }>(s[name])) if (row.carId === id) s[name].delete(row.id);
    }
  });

/** Replaces the whole garage in one transaction (import). */
export const replaceAll = (d: GarageData) =>
  tx(["profiles", "services", "reminders"], (s) => {
    for (const name of ["profiles", "services", "reminders"] as const) {
      s[name].clear();
      for (const row of d[name]) s[name].put(row);
    }
  });
