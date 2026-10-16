import { useCallback, useSyncExternalStore } from "react";

/*
 * Stand-in for lib/storage/settings.ts (JOID-0006, settings.json in a user-picked folder), same signatures.
 * shortcut: browser localStorage, per device; delete this file once lib/storage/settings.ts is in main.
 */
const PREFIX = "obd-dash.setting.";
const listeners = new Set<() => void>();
const parsed = new Map<string, { raw: string; value: unknown }>(); // same raw string → same object, so useSetting can hold arrays/objects

export function getSetting<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + key);
    if (raw === null || raw === undefined) return fallback;
    const hit = parsed.get(key);
    if (hit?.raw === raw) return hit.value as T;
    const value = JSON.parse(raw) as T;
    parsed.set(key, { raw, value });
    return value;
  } catch {
    return fallback; // no storage (SSR, private mode) or a corrupt value
  }
}

export function setSetting<T>(key: string, value: T) {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage full or blocked: the value just won't survive a reload
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

/** [value, set]. Renders the fallback on the server and during hydration, then the stored value. Pass a module-level constant as an object fallback. */
export function useSetting<T>(key: string, fallback: T): [T, (v: T) => void] {
  const value = useSyncExternalStore(subscribe, () => getSetting(key, fallback), () => fallback);
  return [value, useCallback((v: T) => setSetting(key, v), [key])];
}
