// Every app setting: in memory, mirrored to localStorage (so it survives a restart with no folder) and saved to
// settings.json in the linked folder. See docs/storage.md.
import { useCallback, useSyncExternalStore } from "react";
import { create } from "zustand";
import { fileStamp, readText, useFolder, writeText } from "./folder";

const FILE = "settings.json";

// Where these settings used to live in localStorage. Read at startup (under the mirror below), copied into
// settings.json once a folder is linked, then removed. Never written.
const LEGACY: [storageKey: string, key: string, parse: (raw: string) => unknown][] = [
  ["obd-dash.uuids", "ble.uuids", JSON.parse],
  ["obd-dash.garage.active", "garage.activeId", (raw) => raw],
  ...["units", "dashboard.theme", "dashboard.redlineRpm", "dashboard.hudMirror", "dashboard.customLayouts", "alerts.rules"].map(
    (k): [string, string, (raw: string) => unknown] => [`obd-dash.setting.${k}`, k, JSON.parse],
  ),
];

function legacy(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [old, key, parse] of LEGACY) {
    try {
      const raw = globalThis.localStorage?.getItem(old);
      if (raw !== null && raw !== undefined) out[key] = parse(raw);
    } catch {
      // storage blocked, or a corrupt old value: skip it
    }
  }
  return out;
}

const MIRROR = "obd-dash.settings";
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The browser copy: every value, plus the keys changed since settings.json was last written. */
function readMirror(): { values: Record<string, unknown>; pending: string[] } {
  try {
    const m: unknown = JSON.parse(globalThis.localStorage?.getItem(MIRROR) ?? "null");
    if (isObject(m) && isObject(m.values))
      return { values: m.values, pending: Array.isArray(m.pending) ? m.pending.filter((k): k is string => typeof k === "string") : [] };
  } catch {
    // storage blocked, or a corrupt copy: start from the defaults
  }
  return { values: {}, pending: [] };
}

function saveMirror() {
  try {
    globalThis.localStorage?.setItem(MIRROR, JSON.stringify({ values, pending: [...pending] }));
  } catch {
    // private mode, blocked or full: memory (and settings.json, once linked) still have it
  }
}

const mirror = readMirror();
let values: Record<string, unknown> = { ...legacy(), ...mirror.values };
// Changed while settings.json couldn't be written: newer than the file, so they win over it on the next load.
const pending = new Set(mirror.pending);
let loaded = false; // settings.json has been read from the current folder; only then may it be written
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const has = (key: string) => Object.hasOwn(values, key);

/** A problem with settings.json the user should know about (shown by the folder card). */
export const useSettingsWarning = create<{ warning: string }>(() => ({ warning: "" }));

export function subscribeSettings(cb: () => void) {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

export function getSetting<T>(key: string, fallback: T): T {
  return has(key) ? (values[key] as T) : fallback;
}

export function setSetting<T>(key: string, value: T): void {
  values = { ...values, [key]: value };
  pending.add(key);
  saveMirror(); // synchronous, so a restart right after a change keeps it
  listeners.forEach((l) => l());
  if (!loaded) return; // no folder yet: the mirror has it
  clearTimeout(timer);
  timer = setTimeout(() => void write().catch(() => {}), 500); // folder gone: still pending in the mirror
}

const MISSING = Symbol();

/** [value, set]. Renders the fallback on the server and during hydration, then the stored value. */
export function useSetting<T>(key: string, fallback: T): [T, (v: T) => void] {
  const v = useSyncExternalStore(subscribeSettings, () => (has(key) ? values[key] : MISSING), () => MISSING);
  return [v === MISSING ? fallback : (v as T), useCallback((x: T) => setSetting(key, x), [key])];
}

async function write() {
  const snap = values;
  await writeText(FILE, `${JSON.stringify(snap, null, 2)}\n`);
  for (const k of pending) if (values[k] === snap[k]) pending.delete(k); // a key changed mid-write stays pending
  saveMirror();
}

async function load() {
  useSettingsWarning.setState({ warning: "" });
  let file: Record<string, unknown> = {};
  try {
    const text = await readText(FILE);
    if (text !== null) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not a JSON object");
        file = parsed as Record<string, unknown>;
      } catch (e) {
        // Keep the user's text before settings.json is rewritten below.
        const backup = `settings-broken-${fileStamp()}.json`;
        await writeText(backup, text);
        useSettingsWarning.setState({
          warning: `settings.json couldn't be read (${e instanceof Error ? e.message : String(e)}), so default settings are in use. The old file was kept as ${backup}.`,
        });
      }
    }
  } catch {
    return; // folder unavailable again: stay in memory
  }
  const newer = Object.fromEntries([...pending].filter(has).map((k) => [k, values[k]]));
  values = { ...legacy(), ...values, ...file, ...newer }; // the file wins, except over changes it never received
  loaded = true;
  saveMirror();
  listeners.forEach((l) => l());
  try {
    await write();
    for (const [old] of LEGACY) globalThis.localStorage?.removeItem(old); // migrated: settings.json has them now
  } catch {
    // write failed: legacy keys stay so nothing is lost
  }
}

// (Re)load whenever a folder becomes ready or a different one is linked.
useFolder.subscribe((s, prev) => {
  if (s.status === prev.status && s.folderName === prev.folderName) return;
  loaded = false;
  clearTimeout(timer);
  if (s.status === "ready") void load();
});
