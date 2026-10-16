import { afterEach, describe, expect, it, vi } from "vitest";
import { getSetting, setSetting } from "./localSettings";

describe("localSettings stand-in", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("round-trips values and falls back when missing, corrupt or without storage", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) });
    expect(getSetting("units", "metric")).toBe("metric");
    setSetting("units", "imperial");
    expect(getSetting("units", "metric")).toBe("imperial");
    data.set("obd-dash.setting.dashboard.redlineRpm", "{oops");
    expect(getSetting("dashboard.redlineRpm", 6500)).toBe(6500);
    vi.unstubAllGlobals();
    expect(getSetting("units", "metric")).toBe("metric");
  });
});

describe("localSettings objects", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the same object until the stored value changes (stable useSyncExternalStore snapshots)", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) });
    setSetting("x.list", [1, 2]);
    const a = getSetting<number[]>("x.list", []);
    expect(getSetting<number[]>("x.list", [])).toBe(a);
    setSetting("x.list", [1, 2, 3]);
    expect(getSetting<number[]>("x.list", [])).toEqual([1, 2, 3]);
  });
});
