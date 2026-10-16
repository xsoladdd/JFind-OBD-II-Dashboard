// Pure garage logic: types, VIN matching, reminder status, backup validation. No IO, no React.

export type FuelType = "petrol" | "diesel" | "other";
export type OdoUnit = "km" | "mi";
export type ServiceType = "oil" | "tyres" | "brakes" | "other" | "custom";
export type ReminderStatus = "overdue" | "due-soon" | "ok";

export const FUEL_TYPES: FuelType[] = ["petrol", "diesel", "other"];
export const SERVICE_TYPES: ServiceType[] = ["oil", "tyres", "brakes", "other", "custom"];
export const SERVICE_LABEL: Record<ServiceType, string> = {
  oil: "Oil change",
  tyres: "Tyres",
  brakes: "Brakes",
  other: "Other",
  custom: "Custom",
};

export interface CarProfile {
  id: string;
  name: string;
  make: string;
  model: string;
  year: number | null;
  fuelType: FuelType;
  /** Price per litre in `currency`, user-entered. Trips use it for cost estimates. */
  fuelPrice: number | null;
  currency: string;
  /** Uppercase 17-char-ish VIN; every other feature links to a car by this. */
  vin: string | null;
  odometer: number | null;
  odometerUnit: OdoUnit;
  /** ISO timestamp of the last odometer update, or null. */
  odometerAt: string | null;
  /** Curb weight in kg, for the dyno estimate. Optional: files from before it existed don't have it. */
  weightKg?: number | null;
}

export interface ServiceEntry {
  id: string;
  carId: string;
  date: string; // YYYY-MM-DD
  odometer: number | null;
  type: ServiceType;
  customType: string;
  cost: number | null;
  notes: string;
}

export interface Reminder {
  id: string;
  carId: string;
  title: string;
  dueDate: string | null; // YYYY-MM-DD
  dueOdometer: number | null;
}

// App defaults for "due soon", not manufacturer intervals. [verify] with the owner what they prefer.
export const DUE_SOON_DAYS = 30;
export const DUE_SOON_DISTANCE = 1000; // in the car's own unit (km or mi)

export const normalizeVin = (v: string) => v.replace(/\s+/g, "").toUpperCase();

export function findProfileByVin(profiles: CarProfile[], vin: string): CarProfile | undefined {
  const n = normalizeVin(vin);
  if (!n) return undefined;
  return profiles.find((p) => p.vin && normalizeVin(p.vin) === n);
}

/** Best known odometer: the larger of the car's stored value and any logged service reading. */
export function currentOdometer(profile: CarProfile, services: ServiceEntry[]): number | null {
  const vals = [profile.odometer, ...services.filter((s) => s.carId === profile.id).map((s) => s.odometer)].filter(
    (n): n is number => n !== null,
  );
  return vals.length ? Math.max(...vals) : null;
}

const DAY = 86_400_000;
const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY;

export const todayIso = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

const RANK: Record<ReminderStatus, number> = { ok: 0, "due-soon": 1, overdue: 2 };

/** Date and/or odometer; the worse of the two wins. An unknown odometer can't make a reminder due. */
export function reminderStatus(r: Pick<Reminder, "dueDate" | "dueOdometer">, today: string, odometer: number | null): ReminderStatus {
  let worst: ReminderStatus = "ok";
  const bump = (s: ReminderStatus) => {
    if (RANK[s] > RANK[worst]) worst = s;
  };
  if (r.dueDate) {
    const days = dayNumber(r.dueDate) - dayNumber(today);
    bump(days < 0 ? "overdue" : days <= DUE_SOON_DAYS ? "due-soon" : "ok");
  }
  if (r.dueOdometer !== null && odometer !== null) {
    const left = r.dueOdometer - odometer;
    bump(left <= 0 ? "overdue" : left <= DUE_SOON_DISTANCE ? "due-soon" : "ok");
  }
  return worst;
}

/** Number of reminders that are overdue or due soon, for the nav badge. */
export function dueCount(profiles: CarProfile[], services: ServiceEntry[], reminders: Reminder[], today: string): number {
  return reminders.filter((r) => {
    const car = profiles.find((p) => p.id === r.carId);
    return car && reminderStatus(r, today, currentOdometer(car, services)) !== "ok";
  }).length;
}

// ---- backup / import -------------------------------------------------------------------------

export const BACKUP_FORMAT = "obd-dash-garage";
export const BACKUP_VERSION = 1;

export interface GarageBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  profiles: CarProfile[];
  services: ServiceEntry[];
  reminders: Reminder[];
}

export const makeBackup = (profiles: CarProfile[], services: ServiceEntry[], reminders: Reminder[], now = new Date()): GarageBackup => ({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportedAt: now.toISOString(),
  profiles,
  services,
  reminders,
});

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown) => v === null || (isNum(v) && v >= 0);
const isDate = (v: unknown): v is string => isStr(v) && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const dateOrNull = (v: unknown) => v === null || isDate(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => isStr(v) && (list as readonly string[]).includes(v);

class Bad extends Error {}
const need = (ok: boolean, msg: string) => {
  if (!ok) throw new Bad(msg);
};

function checkProfile(p: unknown, i: number): CarProfile {
  const w = `profiles[${i}]`;
  need(isObj(p), `${w} is not an object`);
  const o = p as Obj;
  need(isStr(o.id) && o.id !== "", `${w}.id must be a non-empty string`);
  for (const k of ["name", "make", "model", "currency"]) need(isStr(o[k]), `${w}.${k} must be a string`);
  need(o.year === null || (isNum(o.year) && Number.isInteger(o.year) && o.year >= 1886 && o.year <= 2200), `${w}.year is invalid`);
  need(oneOf(FUEL_TYPES, o.fuelType), `${w}.fuelType must be petrol, diesel or other`);
  need(numOrNull(o.fuelPrice), `${w}.fuelPrice must be a number ≥ 0 or null`);
  need(o.vin === null || isStr(o.vin), `${w}.vin must be a string or null`);
  need(numOrNull(o.odometer), `${w}.odometer must be a number ≥ 0 or null`);
  need(o.odometerUnit === "km" || o.odometerUnit === "mi", `${w}.odometerUnit must be km or mi`);
  need(o.odometerAt === null || isStr(o.odometerAt), `${w}.odometerAt must be a string or null`);
  need(o.weightKg === undefined || numOrNull(o.weightKg), `${w}.weightKg must be a number ≥ 0, null or left out`);
  return { ...(o as unknown as CarProfile), vin: o.vin === null ? null : normalizeVin(o.vin as string) || null };
}

function checkService(s: unknown, i: number): ServiceEntry {
  const w = `services[${i}]`;
  need(isObj(s), `${w} is not an object`);
  const o = s as Obj;
  need(isStr(o.id) && o.id !== "", `${w}.id must be a non-empty string`);
  need(isStr(o.carId), `${w}.carId must be a string`);
  need(isDate(o.date), `${w}.date must be YYYY-MM-DD`);
  need(numOrNull(o.odometer), `${w}.odometer must be a number ≥ 0 or null`);
  need(oneOf(SERVICE_TYPES, o.type), `${w}.type is not a known service type`);
  need(isStr(o.customType), `${w}.customType must be a string`);
  need(numOrNull(o.cost), `${w}.cost must be a number ≥ 0 or null`);
  need(isStr(o.notes), `${w}.notes must be a string`);
  return o as unknown as ServiceEntry;
}

function checkReminder(r: unknown, i: number): Reminder {
  const w = `reminders[${i}]`;
  need(isObj(r), `${w} is not an object`);
  const o = r as Obj;
  need(isStr(o.id) && o.id !== "", `${w}.id must be a non-empty string`);
  need(isStr(o.carId), `${w}.carId must be a string`);
  need(isStr(o.title) && o.title.trim() !== "", `${w}.title must be a non-empty string`);
  need(dateOrNull(o.dueDate), `${w}.dueDate must be YYYY-MM-DD or null`);
  need(numOrNull(o.dueOdometer), `${w}.dueOdometer must be a number ≥ 0 or null`);
  need(o.dueDate !== null || o.dueOdometer !== null, `${w} needs a due date or a due odometer`);
  return o as unknown as Reminder;
}

function uniqueIds(list: { id: string }[], what: string) {
  need(new Set(list.map((x) => x.id)).size === list.length, `${what} contain duplicate ids`);
}

/** Validates untrusted JSON text or an already-parsed value. Never throws; returns a reason on failure. */
export function parseBackup(input: unknown): { ok: true; data: GarageBackup } | { ok: false; error: string } {
  try {
    let v = input;
    if (isStr(v)) {
      try {
        v = JSON.parse(v);
      } catch {
        throw new Bad("File is not valid JSON");
      }
    }
    need(isObj(v), "Backup must be a JSON object");
    const o = v as Obj;
    need(o.format === BACKUP_FORMAT, "Not an OBD Dash garage backup");
    need(o.version === BACKUP_VERSION, `Unsupported backup version ${String(o.version)}`);
    for (const k of ["profiles", "services", "reminders"]) need(Array.isArray(o[k]), `"${k}" must be a list`);
    const profiles = (o.profiles as unknown[]).map(checkProfile);
    const services = (o.services as unknown[]).map(checkService);
    const reminders = (o.reminders as unknown[]).map(checkReminder);
    uniqueIds(profiles, "profiles");
    uniqueIds(services, "services");
    uniqueIds(reminders, "reminders");
    const ids = new Set(profiles.map((p) => p.id));
    need(services.every((s) => ids.has(s.carId)), "A service entry refers to a car that is not in the file");
    need(reminders.every((r) => ids.has(r.carId)), "A reminder refers to a car that is not in the file");
    const vins = profiles.map((p) => p.vin).filter(Boolean);
    need(new Set(vins).size === vins.length, "Two profiles share the same VIN");
    return {
      ok: true,
      data: { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: isStr(o.exportedAt) ? o.exportedAt : "", profiles, services, reminders },
    };
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: e.message };
    throw e;
  }
}
