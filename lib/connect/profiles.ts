import { canonicalUuid, WRITE_METHODS, type UuidOverrides, type WriteMethod } from "../transport/uuidSettings";
import type { GattServiceInfo } from "../transport/WebBluetoothTransport";

/** A named set of adapter settings, saved as "ble.profiles" in settings.json. Empty UUID strings mean "auto-pick". */
export interface AdapterProfile {
  name: string;
  service: string;
  notify: string;
  write: string;
  writeMethod: WriteMethod;
}

/** Short ("fff1", "0xFFF1", 8 hex digits) or full 128-bit UUID. Blank is allowed: it means auto. */
export const isValidUuid = (s: string) => {
  const t = s.trim().toLowerCase().replace(/^0x/, "");
  return t === "" || /^[0-9a-f]{4}$|^[0-9a-f]{8}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(t);
};

export const toOverrides = (p: AdapterProfile): UuidOverrides => ({
  service: p.service,
  notify: p.notify,
  write: p.write,
  writeMethod: p.writeMethod,
});

export const toProfile = (name: string, o: UuidOverrides): AdapterProfile => ({ name: name.trim(), ...o });

const same = (a: string, b: string) => canonicalUuid(a) === canonicalUuid(b);

/** The profile whose settings equal the current overrides, if any. */
export const matchProfile = (profiles: AdapterProfile[], o: UuidOverrides) =>
  profiles.find((p) => same(p.service, o.service) && same(p.notify, o.notify) && same(p.write, o.write) && p.writeMethod === o.writeMethod);

/**
 * The settings that are working right now: the service holding the chosen notify characteristic, both
 * characteristics, and the write method actually used. Null when nothing is connected over Bluetooth.
 */
export function captureInUse(
  gatt: GattServiceInfo[],
  selected: { notify: string; write: string } | null,
  writeMethod: "with-response" | "without-response" | null,
): UuidOverrides | null {
  if (!selected || !writeMethod) return null;
  const svc = gatt.find((s) => s.characteristics.some((c) => c.uuid === selected.notify));
  if (!svc) return null;
  return { service: svc.uuid, notify: selected.notify, write: selected.write, writeMethod };
}

/** Why one entry is invalid, or null. */
function problem(e: unknown): string | null {
  if (!e || typeof e !== "object" || Array.isArray(e)) return "not an object";
  const o = e as Record<string, unknown>;
  if (typeof o.name !== "string" || !o.name.trim()) return "missing name";
  for (const k of ["service", "notify", "write"]) {
    if (typeof o[k] !== "string") return `${k} must be text`;
    if (!isValidUuid(o[k])) return `${k} is not a UUID`;
  }
  if (!WRITE_METHODS.includes(o.writeMethod as WriteMethod)) return "unknown write method";
  return null;
}

const clean = (o: Record<string, unknown>): AdapterProfile => ({
  name: (o.name as string).trim(),
  service: (o.service as string).trim(),
  notify: (o.notify as string).trim(),
  write: (o.write as string).trim(),
  writeMethod: o.writeMethod as WriteMethod,
});

/** Validates profiles from a JSON file. Valid entries are kept; every skipped one is explained. */
export function parseProfiles(text: string): { profiles: AdapterProfile[]; errors: string[] } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { profiles: [], errors: ["The file is not valid JSON."] };
  }
  const list = Array.isArray(json) ? json : (json as { profiles?: unknown } | null)?.profiles;
  if (!Array.isArray(list)) return { profiles: [], errors: ["Expected a list of profiles (or an object with a \"profiles\" list)."] };

  const profiles: AdapterProfile[] = [];
  const errors: string[] = [];
  list.forEach((e, i) => {
    const bad = problem(e);
    if (bad) return void errors.push(`Entry ${i + 1}: ${bad}.`);
    const p = clean(e as Record<string, unknown>);
    if (profiles.some((x) => x.name === p.name)) return void errors.push(`Entry ${i + 1}: name "${p.name}" appears twice.`);
    profiles.push(p);
  });
  return { profiles, errors };
}

/** Reads settings.json's value defensively: it is hand-editable, so anything malformed is dropped. */
export function sanitizeProfiles(v: unknown): AdapterProfile[] {
  if (!Array.isArray(v)) return [];
  const out: AdapterProfile[] = [];
  for (const e of v) {
    if (problem(e)) continue;
    const p = clean(e as Record<string, unknown>);
    if (!out.some((x) => x.name === p.name)) out.push(p);
  }
  return out;
}

export const exportProfiles = (profiles: AdapterProfile[]) => `${JSON.stringify({ profiles }, null, 2)}\n`;

/** Adds or replaces by name (an imported profile wins over an existing one with the same name). */
export function upsertProfiles(existing: AdapterProfile[], incoming: AdapterProfile[]): AdapterProfile[] {
  const names = new Set(incoming.map((p) => p.name));
  return [...existing.filter((p) => !names.has(p.name)), ...incoming];
}
