"use client";

// Stable garage API for other features: profiles + activeProfile (fuel type/price for trips), everything keyed by VIN.
// See docs/garage.md.
import { create } from "zustand";
import { counts, keepBroken, readGarage, writeGarage, GARAGE_FILE, type GarageData } from "../garage/db";
import { deleteLegacy, readLegacy } from "../garage/legacy";
import {
  dueCount,
  findProfileByVin,
  makeBackup,
  normalizeVin,
  parseBackup,
  todayIso,
  type CarProfile,
  type Reminder,
  type ServiceEntry,
} from "../garage/model";
import { readOdometer } from "../garage/odometer";
import { readVin } from "../obd/requests";
import { withPollingPaused } from "../polling/pause";
import { removeFile, useFolder } from "../storage/folder";
import { getSetting, setSetting, subscribeSettings } from "../storage/settings";
import { getClient, useConnection } from "./connection";

// The active car is a setting ("garage.activeId" in settings.json); the cars themselves are in garage/garage.json (lib/garage/db.ts).
const readActive = () => getSetting<string | null>("garage.activeId", null);
const writeActive = (id: string | null) => setSetting("garage.activeId", id);

const uid = () => crypto.randomUUID();
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export type NewProfile = Partial<Omit<CarProfile, "id">>;

export const blankProfile = (over: NewProfile = {}): CarProfile => ({
  id: uid(),
  name: "",
  make: "",
  model: "",
  year: null,
  fuelType: "petrol",
  fuelPrice: null,
  currency: "",
  vin: null,
  odometer: null,
  odometerUnit: "km",
  odometerAt: null,
  weightKg: null,
  ...over,
});

interface GarageState {
  profiles: CarProfile[];
  services: ServiceEntry[];
  reminders: Reminder[];
  activeId: string | null;
  /** The active car, or null. Trips read fuelType / fuelPrice / currency / vin from here. */
  activeProfile: CarProfile | null;
  /** A VIN read from the connected car that matches no profile; the UI offers to create one. */
  detectedVin: string | null;
  loaded: boolean;
  /** garage/garage.json (or the old database) couldn't be read or migrated: edits are refused so nothing is overwritten. */
  readOnly: boolean;
  error: string;

  /** Reads garage/garage.json once the folder is ready (migrating the old IndexedDB garage first time). Safe to call again. */
  load: () => Promise<void>;
  saveProfile: (p: CarProfile) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  setActive: (id: string | null) => void;
  saveService: (s: ServiceEntry) => Promise<void>;
  deleteService: (id: string) => Promise<void>;
  saveReminder: (r: Reminder) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  /** Reads PID 01A6 for the active car. Returns the km value, or null when the car doesn't report it. */
  readOdometerFromCar: () => Promise<number | null>;
  /** Reads the VIN (polling paused) and switches to the matching profile or sets detectedVin. */
  identifyCar: () => Promise<void>;
  dismissDetectedVin: () => void;
  exportJson: () => string;
  importJson: (text: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}

const pick = (profiles: CarProfile[], id: string | null) => profiles.find((p) => p.id === id) ?? null;

const READ_ONLY = "The garage file can't be read, so changes are paused. Fix or replace garage/garage.json, or import a backup.";

// Folder the garage was last loaded from (null: none yet), cars changed while no folder was ready, and the text of an
// unreadable garage.json (copied aside before an import replaces it).
let loadedFrom: string | null = null;
let memoryEdits = false;
let brokenText: string | null = null;
let loadP: Promise<void> = Promise.resolve();

/** `base` plus whatever `extra` has that `base` lacks (by id). */
const addMissing = (base: GarageData, extra: GarageData): GarageData => ({
  profiles: [...base.profiles, ...extra.profiles.filter((x) => !base.profiles.some((b) => b.id === x.id))],
  services: [...base.services, ...extra.services.filter((x) => !base.services.some((b) => b.id === x.id))],
  reminders: [...base.reminders, ...extra.reminders.filter((x) => !base.reminders.some((b) => b.id === x.id))],
});

export const useGarage = create<GarageState>((set, get) => {
  const data = (): GarageData => ({ profiles: get().profiles, services: get().services, reminders: get().reminders });
  const folderReady = () => useFolder.getState().status === "ready";
  const setProfiles = (profiles: CarProfile[]) => {
    const activeId = pick(profiles, get().activeId) ? get().activeId : (profiles[0]?.id ?? null);
    set({ profiles, activeId, activeProfile: pick(profiles, activeId) });
  };
  const show = (d: GarageData, extra: Partial<GarageState> = {}) => {
    const activeId = pick(d.profiles, readActive()) ? readActive() : (d.profiles[0]?.id ?? null);
    set({ ...d, activeId, activeProfile: pick(d.profiles, activeId), loaded: true, ...extra });
  };

  /** Writes the current state to garage.json. Called straight after `set`, so the snapshot is the latest and writes keep call order. */
  const save = async () => {
    if (!folderReady()) return void (memoryEdits = true); // no folder yet: memory only, written when one is ready
    try {
      await writeGarage(data());
      set({ error: "" });
    } catch (e) {
      set({ error: `Couldn't save to your folder: ${errMsg(e)}` });
    }
  };
  /** Waits for a load in progress, refuses while read-only, applies the change, then saves. */
  const mutate = async (change: () => void) => {
    await loadP;
    if (get().readOnly) return void set({ error: READ_ONLY });
    change();
    await save();
  };

  async function loadFromFolder() {
    const key = useFolder.getState().folderName;
    const mem = data();
    const edited = memoryEdits;
    memoryEdits = false;
    let view = mem; // what a failure shows, read-only: the old database's cars if they were read
    try {
      const r = await readGarage();
      if (r.kind === "broken") {
        brokenText = r.text;
        loadedFrom = key;
        return show(mem, { readOnly: true, error: `garage/garage.json couldn't be read (${r.error}). It is kept as it is. ${READ_ONLY}` });
      }
      brokenText = null;
      if (r.kind === "ok") {
        let d = r.data;
        let error = "";
        if (edited) {
          const merged = addMissing(d, mem);
          const ok = parseBackup(makeBackup(merged.profiles, merged.services, merged.reminders));
          if (ok.ok) {
            d = merged;
            await writeGarage(d);
          } else error = `Cars added before the folder was ready weren't merged: ${ok.error}`;
        }
        if ((await readLegacy().catch(() => null)) !== null)
          console.info("obd-dash-garage (IndexedDB) still exists but garage/garage.json wins; the old database was left alone.");
        loadedFrom = key;
        return show(d, { readOnly: false, error });
      }
      // No file yet: migrate the old database, if it has data.
      const old = await readLegacy();
      const hasOld = !!old && counts(old).some(Boolean);
      const d = hasOld ? addMissing(old, mem) : mem;
      view = d;
      if (!hasOld && !edited) {
        if (old) await deleteLegacy().catch(() => {}); // empty: nothing to lose
        loadedFrom = key;
        return show(d, { readOnly: false, error: "" });
      }
      try {
        await writeGarage(d);
        const back = await readGarage();
        if (back.kind !== "ok" || counts(back.data).join() !== counts(d).join())
          throw new Error(back.kind === "broken" ? back.error : "the saved file didn't match");
      } catch (e) {
        if (hasOld) await removeFile(GARAGE_FILE).catch(() => {}); // so the migration runs again next time
        throw new Error(`moving your cars from the old browser database failed (${errMsg(e)}). The old data is untouched`, { cause: e });
      }
      if (hasOld) await deleteLegacy().catch((e: unknown) => console.warn("Couldn't delete the old garage database:", e));
      loadedFrom = key;
      show(d, { readOnly: false, error: "" });
    } catch (e) {
      memoryEdits = memoryEdits || edited;
      show(view, { readOnly: true, error: `${errMsg(e)}. ${READ_ONLY}` });
    }
  }

  return {
    profiles: [],
    services: [],
    reminders: [],
    activeId: null,
    activeProfile: null,
    detectedVin: null,
    loaded: false,
    readOnly: false,
    error: "",

    load() {
      if (typeof window === "undefined") return Promise.resolve();
      loadP = loadP.then(async () => {
        if (!folderReady()) return set({ loaded: true }); // works in memory until a folder is ready
        if (loadedFrom === useFolder.getState().folderName && !get().readOnly) return;
        await loadFromFolder();
      });
      return loadP;
    },

    async saveProfile(p) {
      const next = { ...p, vin: p.vin ? normalizeVin(p.vin) || null : null };
      await mutate(() => {
        setProfiles(get().profiles.some((x) => x.id === next.id) ? get().profiles.map((x) => (x.id === next.id ? next : x)) : [...get().profiles, next]);
        if (get().detectedVin && next.vin === normalizeVin(get().detectedVin!)) set({ detectedVin: null });
      });
    },

    async deleteProfile(id) {
      await mutate(() => {
        set({
          services: get().services.filter((s) => s.carId !== id),
          reminders: get().reminders.filter((r) => r.carId !== id),
        });
        setProfiles(get().profiles.filter((p) => p.id !== id));
        writeActive(get().activeId);
      });
    },

    setActive(id) {
      writeActive(id);
      set({ activeId: id, activeProfile: pick(get().profiles, id) });
    },

    saveService: (s) =>
      mutate(() => set({ services: get().services.some((x) => x.id === s.id) ? get().services.map((x) => (x.id === s.id ? s : x)) : [...get().services, s] })),
    deleteService: (id) => mutate(() => set({ services: get().services.filter((s) => s.id !== id) })),
    saveReminder: (r) =>
      mutate(() => set({ reminders: get().reminders.some((x) => x.id === r.id) ? get().reminders.map((x) => (x.id === r.id ? r : x)) : [...get().reminders, r] })),
    deleteReminder: (id) => mutate(() => set({ reminders: get().reminders.filter((r) => r.id !== id) })),

    async readOdometerFromCar() {
      const client = getClient();
      const car = get().activeProfile;
      if (!client?.isOpen || !car) return null;
      const km = await withPollingPaused(() => readOdometer(client));
      if (km === null) return null;
      const value = car.odometerUnit === "km" ? km : km / 1.609344;
      await get().saveProfile({ ...car, odometer: Math.round(value * 10) / 10, odometerAt: new Date().toISOString() });
      return km;
    },

    async identifyCar() {
      const client = getClient();
      if (!client?.isOpen) return;
      try {
        const vin = normalizeVin(await withPollingPaused(() => readVin(client)));
        if (vin.length < 11) return; // not a usable VIN (garbled or empty reply)
        await get().load();
        const match = findProfileByVin(get().profiles, vin);
        if (match) {
          get().setActive(match.id);
          set({ detectedVin: null });
        } else set({ detectedVin: vin });
      } catch {
        // No Mode 09 on this car, or the link dropped: keep the current selection.
      }
    },

    dismissDetectedVin: () => set({ detectedVin: null }),

    exportJson: () => JSON.stringify(makeBackup(get().profiles, get().services, get().reminders), null, 2),

    async importJson(text) {
      const r = parseBackup(text);
      if (!r.ok) return r;
      await loadP;
      try {
        // Replacing an unreadable garage.json: keep its text first.
        if (get().readOnly && brokenText !== null && folderReady()) await keepBroken(brokenText);
        if (folderReady()) await writeGarage(r.data);
        else memoryEdits = true;
      } catch (e) {
        return { ok: false, error: errMsg(e) };
      }
      brokenText = null;
      if (folderReady()) loadedFrom = useFolder.getState().folderName;
      const { services, reminders } = r.data;
      set({ services, reminders, detectedVin: null, readOnly: false, error: "" });
      setProfiles(r.data.profiles);
      writeActive(get().activeId);
      return { ok: true };
    },
  };
});

/** Overdue + due-soon reminders across all cars (nav badge). */
export const useGarageDueCount = () =>
  useGarage((s) => dueCount(s.profiles, s.services, s.reminders, todayIso()));

// Auto-select: every time the app connects (or is already connected when this module loads), read the VIN.
// Imported by the Garage page and the nav badge, so it runs wherever either is mounted.
if (typeof window !== "undefined") {
  void useGarage.getState().load();
  // Load the garage file whenever a folder becomes ready, or a different one is linked.
  useFolder.subscribe((s, prev) => {
    if (s.status === "ready" && (prev.status !== "ready" || s.folderName !== prev.folderName)) void useGarage.getState().load();
  });
  // settings.json loads after the folder is restored, which may be after the cars: apply its active car then.
  subscribeSettings(() => {
    const s = useGarage.getState();
    const id = readActive();
    if (id !== s.activeId && pick(s.profiles, id)) useGarage.setState({ activeId: id, activeProfile: pick(s.profiles, id) });
  });
  let was = useConnection.getState().status;
  if (was === "connected") void useGarage.getState().identifyCar();
  useConnection.subscribe((s) => {
    if (s.status === "connected" && was !== "connected") void useGarage.getState().identifyCar();
    was = s.status;
  });
}
