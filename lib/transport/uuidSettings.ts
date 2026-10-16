/** User overrides for the GATT UUIDs, persisted per browser. Empty strings mean "auto-pick". */
export interface UuidOverrides {
  service: string;
  notify: string;
  write: string;
}

const KEY = "obd-dash.uuids";
export const EMPTY_OVERRIDES: UuidOverrides = { service: "", notify: "", write: "" };

export function loadOverrides(): UuidOverrides {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY_OVERRIDES, ...(JSON.parse(raw) as Partial<UuidOverrides>) } : EMPTY_OVERRIDES;
  } catch {
    return EMPTY_OVERRIDES;
  }
}

export function saveOverrides(o: UuidOverrides) {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    // storage blocked (private mode): the override then only lasts for this page view
  }
}

/** "fff1", "0xFFF1" or a full 128-bit UUID → canonical lowercase 128-bit form. */
export function canonicalUuid(s: string): string {
  const t = s.trim().toLowerCase().replace(/^0x/, "");
  if (/^[0-9a-f]{4}$|^[0-9a-f]{8}$/.test(t)) {
    return `${t.padStart(8, "0")}-0000-1000-8000-00805f9b34fb`;
  }
  return t;
}
