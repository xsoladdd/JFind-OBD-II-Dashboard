import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeDir, FakeFile } from "../storage/fakeFs";
import { makeBackup, type CarProfile, type Reminder, type ServiceEntry } from "./model";
import type { GarageData } from "./db";

const car = (over: Partial<CarProfile> = {}): CarProfile => ({
  id: "c1", name: "Golf", make: "VW", model: "Golf", year: 2015, fuelType: "diesel", fuelPrice: 18.5, currency: "SEK",
  vin: "WVWZZZ1KZAW000001", odometer: 100000, odometerUnit: "km", odometerAt: null, ...over,
});
const svc = (over: Partial<ServiceEntry> = {}): ServiceEntry => ({
  id: "s1", carId: "c1", date: "2025-01-10", odometer: 99000, type: "oil", customType: "", cost: 800, notes: "", ...over,
});
const rem = (over: Partial<Reminder> = {}): Reminder => ({ id: "r1", carId: "c1", title: "Oil", dueDate: "2026-12-01", dueOdometer: null, ...over });
const data = (profiles = [car()], services = [svc()], reminders = [rem()]): GarageData => ({ profiles, services, reminders });
const file = (d: GarageData) => JSON.stringify(makeBackup(d.profiles, d.services, d.reminders));

/** Stands in for the old IndexedDB garage: lib/garage/legacy is the only code that touches it. */
function fakeLegacy(initial: GarageData | null) {
  const old = { data: initial, deleted: false, deleteFails: false };
  vi.doMock("./legacy", () => ({
    readLegacy: async () => old.data,
    deleteLegacy: async () => {
      if (old.deleteFails) throw new Error("blocked");
      old.data = null;
      old.deleted = true;
    },
  }));
  return old;
}

/** Fresh module state, a folder at `root` (not linked yet), and the garage store. */
async function boot(root: FakeDir, legacy: GarageData | null = null) {
  vi.resetModules();
  vi.stubGlobal("window", {});
  vi.stubGlobal("showDirectoryPicker", async () => root);
  const old = fakeLegacy(legacy);
  const folder = await import("../storage/folder");
  const { useGarage } = await import("../store/garage");
  await folder.initFolder();
  const link = async () => {
    await folder.useFolder.getState().link();
    await useGarage.getState().load();
  };
  return { folder, old, link, garage: () => useGarage.getState() };
}

/** garage/ whose file writes fail, or "corrupt": writes that read back as something else. */
function sabotage(root: FakeDir, how: "fail" | "short" | "garbage") {
  const dir = new FakeDir("garage");
  let stored: string | null = null;
  const nf = () => Object.assign(new Error("NotFoundError"), { name: "NotFoundError" });
  dir.getFileHandle = (async (_n: string, o?: { create?: boolean }) => {
    if (o?.create) {
      if (how === "fail") throw new Error("disk full");
      return {
        kind: "file",
        createWritable: async () => ({
          seek: async () => {},
          write: async () => {},
          close: async () => void (stored = how === "short" ? file(data([], [], [])) : '{"garbage'),
        }),
      };
    }
    if (stored === null) throw nf();
    return { kind: "file", getFile: async () => ({ size: stored!.length, lastModified: 0, text: async () => stored! }) };
  }) as unknown as FakeDir["getFileHandle"];
  dir.removeEntry = async () => void (stored = null);
  root.entries.set("garage", dir);
  return { stored: () => stored };
}

const onDisk = (root: FakeDir) => root.file("garage/garage.json")?.data;
const counts = (text: string) => {
  const o = JSON.parse(text) as GarageData;
  return [o.profiles.length, o.services.length, o.reminders.length];
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("./legacy");
  vi.restoreAllMocks();
});

describe("garage file", () => {
  it("round-trips through garage/garage.json in the backup format", async () => {
    const root = new FakeDir("OBD Dash");
    const a = await boot(root);
    await a.link();
    await a.garage().saveProfile(car());
    await a.garage().saveService(svc());
    await a.garage().saveReminder(rem());
    const f = JSON.parse(onDisk(root)!);
    expect(f).toMatchObject({ format: "obd-dash-garage", version: 1 });
    expect(counts(onDisk(root)!)).toEqual([1, 1, 1]);

    await a.garage().deleteService("s1");
    expect(counts(onDisk(root)!)).toEqual([1, 0, 1]);

    const b = await boot(root); // a new visit
    await b.link();
    expect(b.garage()).toMatchObject({ loaded: true, readOnly: false, error: "" });
    expect(b.garage().profiles).toEqual([car()]);
    expect(b.garage().reminders).toEqual([rem()]);
    expect(b.garage().activeProfile?.id).toBe("c1");

    await b.garage().deleteProfile("c1"); // cascades
    expect(counts(onDisk(root)!)).toEqual([0, 0, 0]);
  });

  it("works in memory until a folder is ready, then writes it", async () => {
    const root = new FakeDir("OBD Dash");
    const a = await boot(root);
    expect(a.garage().loaded).toBe(true);
    await a.garage().saveProfile(car());
    expect(a.garage().profiles).toHaveLength(1);
    expect(onDisk(root)).toBeUndefined();
    await a.link();
    expect(counts(onDisk(root)!)).toEqual([1, 0, 0]);
  });

  it("merges cars added before the folder was ready into the file (the file wins on a clash)", async () => {
    const root = new FakeDir("OBD Dash").seed("garage/garage.json", file(data([car({ name: "From file" })], [], [])));
    const a = await boot(root);
    await a.garage().saveProfile(car({ name: "Memory", id: "c1" }));
    await a.garage().saveProfile(car({ id: "c2", name: "Other", vin: null }));
    await a.link();
    expect(a.garage().profiles.map((p) => p.name)).toEqual(["From file", "Other"]);
    expect(counts(onDisk(root)!)).toEqual([2, 0, 0]);
  });

  it("keeps a failed save in memory and says so", async () => {
    const root = new FakeDir("OBD Dash");
    const a = await boot(root);
    await a.link();
    sabotage(root, "fail");
    await a.garage().saveProfile(car());
    expect(a.garage().profiles).toHaveLength(1);
    expect(a.garage().error).toMatch(/Couldn't save to your folder: disk full/);
  });

  it("serialises writes: two quick edits both end up in the file, the later one last", async () => {
    const root = new FakeDir("OBD Dash");
    const a = await boot(root);
    await a.link();
    const real = FakeFile.prototype.createWritable;
    let n = 0;
    vi.spyOn(FakeFile.prototype, "createWritable").mockImplementation(async function (this: FakeFile, o) {
      const w = await real.call(this, o);
      if (this.name !== "garage.json" || n++ > 0) return w;
      return { ...w, close: async () => (await new Promise((r) => setTimeout(r, 40)), w.close()) }; // the first write is slow
    });
    await Promise.all([a.garage().saveProfile(car()), a.garage().saveProfile(car({ id: "c2", name: "Second", vin: null }))]);
    expect(JSON.parse(onDisk(root)!).profiles.map((p: CarProfile) => p.id)).toEqual(["c1", "c2"]);
  });
});

describe("malformed garage.json", () => {
  it("is never overwritten: read-only with an error, edits refused", async () => {
    const root = new FakeDir("OBD Dash").seed("garage/garage.json", '{"format":"obd-dash-garage","profiles":');
    const a = await boot(root);
    await a.link();
    expect(a.garage()).toMatchObject({ loaded: true, readOnly: true });
    expect(a.garage().error).toMatch(/garage\.json couldn't be read.*not valid JSON/);
    await a.garage().saveProfile(car());
    expect(a.garage().profiles).toEqual([]);
    expect(onDisk(root)).toBe('{"format":"obd-dash-garage","profiles":');
    expect([...(root.entries.get("garage") as FakeDir).entries.keys()]).toEqual(["garage.json"]);
  });

  it("recovers when the user fixes the file and tries again", async () => {
    const root = new FakeDir("OBD Dash").seed("garage/garage.json", "nope");
    const a = await boot(root);
    await a.link();
    expect(a.garage().readOnly).toBe(true);
    root.seed("garage/garage.json", file(data()));
    await a.garage().load(); // "Try again"
    expect(a.garage()).toMatchObject({ readOnly: false, error: "" });
    expect(a.garage().profiles).toHaveLength(1);
  });

  it("an import replaces it, after the old text is copied aside", async () => {
    const root = new FakeDir("OBD Dash").seed("garage/garage.json", "nope");
    const a = await boot(root);
    await a.link();
    expect(await a.garage().importJson(file(data()))).toEqual({ ok: true });
    expect(a.garage()).toMatchObject({ readOnly: false, error: "" });
    expect(counts(onDisk(root)!)).toEqual([1, 1, 1]);
    const kept = [...(root.entries.get("garage") as FakeDir).entries.keys()].find((k) => k.startsWith("garage-broken-"));
    expect(root.file(`garage/${kept}`)?.data).toBe("nope");
  });

  it("rejects an invalid import without touching anything", async () => {
    const root = new FakeDir("OBD Dash");
    const a = await boot(root);
    await a.link();
    await a.garage().saveProfile(car());
    const before = onDisk(root);
    expect((await a.garage().importJson("{}")).ok).toBe(false);
    expect(onDisk(root)).toBe(before);
    expect(a.garage().profiles).toHaveLength(1);
  });
});

describe("migration from the old IndexedDB garage", () => {
  it("writes the file, verifies it, then deletes the old database", async () => {
    const root = new FakeDir("OBD Dash");
    const a = await boot(root, data());
    await a.link();
    expect(counts(onDisk(root)!)).toEqual([1, 1, 1]);
    expect(a.old.deleted).toBe(true);
    expect(a.garage()).toMatchObject({ readOnly: false, error: "" });
    expect(a.garage().profiles).toEqual([car()]);
    expect(a.garage().services).toEqual([svc()]);
  });

  it("keeps the old database when the write fails, and retries next time", async () => {
    const root = new FakeDir("OBD Dash");
    sabotage(root, "fail");
    const a = await boot(root, data());
    await a.link();
    expect(a.old.deleted).toBe(false);
    expect(a.old.data).not.toBeNull();
    expect(a.garage()).toMatchObject({ readOnly: true });
    expect(a.garage().error).toMatch(/old data is untouched/);
    expect(a.garage().profiles).toHaveLength(1); // still visible
    await a.garage().saveProfile(car({ id: "c9", vin: null }));
    expect(a.garage().profiles).toHaveLength(1); // but read-only

    root.entries.delete("garage"); // next visit, folder fine again
    const b = await boot(root, a.old.data);
    await b.link();
    expect(b.old.deleted).toBe(true);
    expect(counts(onDisk(root)!)).toEqual([1, 1, 1]);
  });

  it.each(["short", "garbage"] as const)("keeps the old database when the file reads back wrong (%s)", async (how) => {
    const root = new FakeDir("OBD Dash");
    const s = sabotage(root, how);
    const a = await boot(root, data());
    await a.link();
    expect(a.old.deleted).toBe(false);
    expect(a.garage().readOnly).toBe(true);
    expect(s.stored()).toBeNull(); // the bad file was removed so the next visit migrates again
  });

  it("an existing file wins: the old database is left alone and logged", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const mine = data([car({ id: "new", name: "Newer", vin: null })], [], []);
    const root = new FakeDir("OBD Dash").seed("garage/garage.json", file(mine));
    const a = await boot(root, data());
    await a.link();
    expect(a.garage().profiles.map((p) => p.name)).toEqual(["Newer"]);
    expect(a.old.deleted).toBe(false);
    expect(a.old.data).toEqual(data());
    expect(info).toHaveBeenCalledWith(expect.stringContaining("garage.json wins"));
    expect(counts(onDisk(root)!)).toEqual([1, 0, 0]);
  });

  it("doesn't delete the old database when nothing could be verified (delete failure is not fatal)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const root = new FakeDir("OBD Dash");
    const a = await boot(root, data());
    a.old.deleteFails = true;
    await a.link();
    expect(a.garage()).toMatchObject({ readOnly: false, error: "" });
    expect(counts(onDisk(root)!)).toEqual([1, 1, 1]);
    expect(warn).toHaveBeenCalled();
  });

  it("removes an empty old database and writes no file", async () => {
    const root = new FakeDir("OBD Dash");
    const a = await boot(root, data([], [], []));
    await a.link();
    expect(a.old.deleted).toBe(true);
    expect(onDisk(root)).toBeUndefined();
  });
});
