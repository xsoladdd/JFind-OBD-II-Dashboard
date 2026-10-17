import { getSetting, setSetting } from "../storage/settings";

/** User overrides for the GATT UUIDs, saved as "ble.uuids" in settings.json. Empty strings mean "auto-pick". */
export interface UuidOverrides {
  service: string;
  notify: string;
  write: string;
  /** "auto" prefers writeWithoutResponse when the characteristic offers it (README [verify]). */
  writeMethod: WriteMethod;
}

export type WriteMethod = "auto" | "with-response" | "without-response";
export const WRITE_METHODS: WriteMethod[] = ["auto", "with-response", "without-response"];

export const EMPTY_OVERRIDES: UuidOverrides = { service: "", notify: "", write: "", writeMethod: "auto" };

export function loadOverrides(): UuidOverrides {
  // settings.json is user-editable: keep only string fields.
  const o = getSetting<Partial<Record<keyof UuidOverrides, unknown>> | null>("ble.uuids", null) ?? {};
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const method = WRITE_METHODS.find((m) => m === o.writeMethod) ?? "auto";
  return { service: str(o.service), notify: str(o.notify), write: str(o.write), writeMethod: method };
}

export function saveOverrides(o: UuidOverrides) {
  setSetting("ble.uuids", o);
}

/** "fff1", "0xFFF1" or a full 128-bit UUID → canonical lowercase 128-bit form. */
export function canonicalUuid(s: string): string {
  const t = s.trim().toLowerCase().replace(/^0x/, "");
  if (/^[0-9a-f]{4}$|^[0-9a-f]{8}$/.test(t)) {
    return `${t.padStart(8, "0")}-0000-1000-8000-00805f9b34fb`;
  }
  return t;
}
