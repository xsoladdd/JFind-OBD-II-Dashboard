import { describe, expect, it } from "vitest";
import { ElmClient } from "../elm/ElmClient";
import { readVin } from "../obd/requests";
import { SIM_ODOMETER_KM } from "../sim/garage";
import { SIM_VIN } from "../sim/elm327";
import { SimulatorTransport } from "../transport/SimulatorTransport";
import {
  currentOdometer,
  dueCount,
  findProfileByVin,
  makeBackup,
  parseBackup,
  reminderStatus,
  type CarProfile,
  type Reminder,
  type ServiceEntry,
} from "./model";
import { readOdometer } from "./odometer";

const car = (over: Partial<CarProfile> = {}): CarProfile => ({
  id: "c1", name: "Golf", make: "VW", model: "Golf", year: 2015, fuelType: "diesel", fuelPrice: 18.5, currency: "SEK",
  vin: "WVWZZZ1KZAW000001", odometer: 100000, odometerUnit: "km", odometerAt: null, ...over,
});
const svc = (over: Partial<ServiceEntry> = {}): ServiceEntry => ({
  id: "s1", carId: "c1", date: "2025-01-10", odometer: 99000, type: "oil", customType: "", cost: 800, notes: "", ...over,
});
const rem = (over: Partial<Reminder> = {}): Reminder => ({ id: "r1", carId: "c1", title: "Oil", dueDate: null, dueOdometer: null, ...over });

describe("profile matching by VIN", () => {
  const profiles = [car(), car({ id: "c2", vin: null }), car({ id: "c3", vin: "ABC12345678901234" })];
  it("matches ignoring case and whitespace", () => {
    expect(findProfileByVin(profiles, " wvwzzz1kzaw000001 ")?.id).toBe("c1");
    expect(findProfileByVin(profiles, "abc 12345678901234")?.id).toBe("c3");
  });
  it("returns undefined for unknown or empty VINs and never matches profiles without a VIN", () => {
    expect(findProfileByVin(profiles, "UNKNOWN0000000000")).toBeUndefined();
    expect(findProfileByVin(profiles, "")).toBeUndefined();
  });
});

describe("reminder status", () => {
  const today = "2025-06-15";
  it("date: overdue, due soon (≤30 days), ok", () => {
    expect(reminderStatus(rem({ dueDate: "2025-06-14" }), today, null)).toBe("overdue");
    expect(reminderStatus(rem({ dueDate: "2025-06-15" }), today, null)).toBe("due-soon");
    expect(reminderStatus(rem({ dueDate: "2025-07-15" }), today, null)).toBe("due-soon");
    expect(reminderStatus(rem({ dueDate: "2025-07-16" }), today, null)).toBe("ok");
  });
  it("odometer: overdue at or past the mark, due soon within 1000, ok beyond", () => {
    expect(reminderStatus(rem({ dueOdometer: 100000 }), today, 100000)).toBe("overdue");
    expect(reminderStatus(rem({ dueOdometer: 100900 }), today, 100000)).toBe("due-soon");
    expect(reminderStatus(rem({ dueOdometer: 101001 }), today, 100000)).toBe("ok");
  });
  it("worst of date and odometer wins; unknown odometer is not overdue", () => {
    expect(reminderStatus(rem({ dueDate: "2026-01-01", dueOdometer: 99000 }), today, 100000)).toBe("overdue");
    expect(reminderStatus(rem({ dueDate: "2025-06-01", dueOdometer: 200000 }), today, 100000)).toBe("overdue");
    expect(reminderStatus(rem({ dueOdometer: 5 }), today, null)).toBe("ok");
  });
  it("uses the larger of profile odometer and logged service odometer", () => {
    expect(currentOdometer(car(), [svc({ odometer: 105000 })])).toBe(105000);
    expect(currentOdometer(car({ odometer: null }), [svc({ carId: "other" })])).toBeNull();
  });
  it("counts overdue and due-soon for the badge", () => {
    const rs = [rem({ dueDate: "2025-06-01" }), rem({ id: "r2", dueDate: "2025-06-20" }), rem({ id: "r3", dueDate: "2030-01-01" })];
    expect(dueCount([car()], [], rs, today)).toBe(2);
  });
});

describe("backup import validation", () => {
  const good = makeBackup([car()], [svc()], [rem({ dueDate: "2025-12-01" })], new Date("2025-06-15T00:00:00Z"));
  const bad = (mut: (b: Record<string, unknown>) => void) => {
    const b = JSON.parse(JSON.stringify(good)) as Record<string, unknown>;
    mut(b);
    return parseBackup(b);
  };
  it("round-trips an export, as text or parsed", () => {
    expect(parseBackup(JSON.stringify(good))).toMatchObject({ ok: true });
    const r = parseBackup(good);
    expect(r.ok && r.data.profiles[0]!.vin).toBe("WVWZZZ1KZAW000001");
  });
  it("rejects malformed files", () => {
    expect(parseBackup("{nope")).toMatchObject({ ok: false });
    expect(parseBackup("[]")).toMatchObject({ ok: false });
    expect(parseBackup(null)).toMatchObject({ ok: false });
    expect(bad((b) => (b.format = "other"))).toMatchObject({ ok: false });
    expect(bad((b) => (b.version = 2))).toMatchObject({ ok: false });
    expect(bad((b) => delete b.services)).toMatchObject({ ok: false });
    expect(bad((b) => ((b.profiles as CarProfile[])[0]!.fuelType = "electric" as never))).toMatchObject({ ok: false });
    expect(bad((b) => ((b.profiles as CarProfile[])[0]!.fuelPrice = -1))).toMatchObject({ ok: false });
    expect(bad((b) => ((b.services as ServiceEntry[])[0]!.date = "10/01/2025"))).toMatchObject({ ok: false });
    expect(bad((b) => ((b.services as ServiceEntry[])[0]!.type = "wash" as never))).toMatchObject({ ok: false });
    expect(bad((b) => ((b.services as ServiceEntry[])[0]!.carId = "ghost"))).toMatchObject({ ok: false });
    expect(bad((b) => ((b.reminders as Reminder[])[0]!.dueDate = null))).toMatchObject({ ok: false });
    expect(bad((b) => (b.profiles as CarProfile[]).push(car()))).toMatchObject({ ok: false });
  });
});

describe("through the simulator", () => {
  const connect = async () => {
    const client = new ElmClient(new SimulatorTransport({ chunkSize: 4, delayMs: 0, seed: 1 }), { reconnectDelayMs: 1 });
    await client.connect();
    return client;
  };
  it("matches the simulator VIN to a stored profile", async () => {
    const client = await connect();
    const profiles = [car({ id: "sim", vin: SIM_VIN.toLowerCase() }), car()];
    expect(findProfileByVin(profiles, await readVin(client))?.id).toBe("sim");
  });
  it("reads the odometer when 01A0 says A6 is supported", async () => {
    expect(await readOdometer(await connect())).toBeCloseTo(SIM_ODOMETER_KM, 1);
  });
  it("returns null when the car's 01A0 mask doesn't include A6", async () => {
    expect(await readOdometer({ send: async () => ["41 A0 00 00 00 00"] })).toBeNull();
  });
});
