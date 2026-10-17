// The garage is one file, garage/garage.json, in the storage folder: the backup format from ./model. See docs/garage.md.
import { fileStamp, readText, writeText } from "../storage/folder";
import { makeBackup, parseBackup, type CarProfile, type Reminder, type ServiceEntry } from "./model";

export const GARAGE_FILE = "garage/garage.json";

export interface GarageData {
  profiles: CarProfile[];
  services: ServiceEntry[];
  reminders: Reminder[];
}

export type GarageRead = { kind: "missing" } | { kind: "ok"; data: GarageData } | { kind: "broken"; text: string; error: string };

/** Never throws on bad content (that's "broken"); I/O errors still reject. */
export async function readGarage(): Promise<GarageRead> {
  const text = await readText(GARAGE_FILE);
  if (text === null) return { kind: "missing" };
  const r = parseBackup(text);
  return r.ok ? { kind: "ok", data: r.data } : { kind: "broken", text, error: r.error };
}

/** Replaces the whole file atomically. writeText queues in call order, so callers must snapshot right before calling. */
export const writeGarage = (d: GarageData) =>
  writeText(GARAGE_FILE, `${JSON.stringify(makeBackup(d.profiles, d.services, d.reminders), null, 2)}\n`);

/** Copies unreadable garage text aside before anything replaces it; returns the new path. */
export async function keepBroken(text: string): Promise<string> {
  const path = `garage/garage-broken-${fileStamp()}.json`;
  await writeText(path, text);
  return path;
}

export const counts = (d: GarageData) => [d.profiles.length, d.services.length, d.reminders.length];
