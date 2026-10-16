"use client";

// Stable garage API for other features: profiles + activeProfile (fuel type/price for trips), everything keyed by VIN.
// See docs/garage.md.
import { create } from "zustand";
import * as db from "../garage/db";
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
import { getSetting, setSetting, subscribeSettings } from "../storage/settings";
import { getClient, useConnection } from "./connection";

// The active car is a setting ("garage.activeId" in settings.json); the cars themselves stay in IndexedDB.
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
  error: string;

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

export const useGarage = create<GarageState>((set, get) => {
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
      set({ error: "" });
    } catch (e) {
      set({ error: `Could not save to this browser's storage: ${errMsg(e)}` });
    }
  };
  const setProfiles = (profiles: CarProfile[]) => {
    const activeId = pick(profiles, get().activeId) ? get().activeId : (profiles[0]?.id ?? null);
    set({ profiles, activeId, activeProfile: pick(profiles, activeId) });
  };

  return {
    profiles: [],
    services: [],
    reminders: [],
    activeId: null,
    activeProfile: null,
    detectedVin: null,
    loaded: false,
    error: "",

    async load() {
      if (get().loaded || typeof indexedDB === "undefined") return;
      try {
        const d = await db.loadAll();
        const activeId = pick(d.profiles, readActive()) ? readActive() : (d.profiles[0]?.id ?? null);
        set({ ...d, activeId, activeProfile: pick(d.profiles, activeId), loaded: true });
      } catch (e) {
        set({ loaded: true, error: `Could not open this browser's storage: ${errMsg(e)}` });
      }
    },

    async saveProfile(p) {
      const next = { ...p, vin: p.vin ? normalizeVin(p.vin) || null : null };
      await run(async () => {
        await db.put("profiles", next);
        const profiles = get().profiles.some((x) => x.id === next.id)
          ? get().profiles.map((x) => (x.id === next.id ? next : x))
          : [...get().profiles, next];
        setProfiles(profiles);
        if (get().detectedVin && next.vin === normalizeVin(get().detectedVin!)) set({ detectedVin: null });
      });
    },

    async deleteProfile(id) {
      await run(async () => {
        await db.deleteCar(id);
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

    async saveService(s) {
      await run(async () => {
        await db.put("services", s);
        set({ services: get().services.some((x) => x.id === s.id) ? get().services.map((x) => (x.id === s.id ? s : x)) : [...get().services, s] });
      });
    },
    async deleteService(id) {
      await run(async () => {
        await db.remove("services", id);
        set({ services: get().services.filter((s) => s.id !== id) });
      });
    },
    async saveReminder(r) {
      await run(async () => {
        await db.put("reminders", r);
        set({ reminders: get().reminders.some((x) => x.id === r.id) ? get().reminders.map((x) => (x.id === r.id ? r : x)) : [...get().reminders, r] });
      });
    },
    async deleteReminder(id) {
      await run(async () => {
        await db.remove("reminders", id);
        set({ reminders: get().reminders.filter((r) => r.id !== id) });
      });
    },

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
      try {
        await db.replaceAll(r.data);
      } catch (e) {
        return { ok: false, error: errMsg(e) };
      }
      const { profiles, services, reminders } = r.data;
      set({ services, reminders, detectedVin: null });
      setProfiles(profiles);
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
