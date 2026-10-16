import { describe, expect, it } from "vitest";
import { deltaFromDisplay, deltaToDisplay, evaluate, fromDisplay, IDLE, type AlertRule, type RuleState } from "./rules";

const rule = (r: Partial<AlertRule>): AlertRule => ({ id: "r", pid: "0105", op: "above", threshold: 100, hysteresis: 0, durationS: 0, enabled: true, ...r });

/** Runs readings [value, t] through a rule and returns the edges. */
function run(r: AlertRule, readings: [number, number][]) {
  let s: RuleState = IDLE;
  return readings.map(([v, t]) => {
    const out = evaluate(r, s, v, t);
    s = out.state;
    return out.event;
  });
}

describe("alert rule evaluation", () => {
  it("fires above and below the threshold, once per crossing", () => {
    expect(run(rule({}), [[99, 0], [101, 1], [102, 2], [99, 3], [101, 4]])).toEqual([null, "fire", null, "clear", "fire"]);
    expect(run(rule({ op: "below", threshold: 12 }), [[12.5, 0], [11.9, 1], [11.8, 2], [12.1, 3]])).toEqual([null, "fire", null, "clear"]);
  });

  it("waits for the minimum duration, so a one-sample spike doesn't fire", () => {
    const r = rule({ durationS: 2 });
    expect(run(r, [[150, 0], [90, 500], [101, 1000], [101, 2000], [101, 3000]])).toEqual([null, null, null, null, "fire"]);
  });

  it("uses hysteresis so a value hovering at the threshold doesn't flap", () => {
    const r = rule({ hysteresis: 3 });
    expect(run(r, [[101, 0], [99, 1], [101, 2], [98, 3], [97, 4], [101, 5]])).toEqual(["fire", null, null, null, "clear", "fire"]);
    const low = rule({ op: "below", threshold: 12, hysteresis: 0.5 });
    expect(run(low, [[11.9, 0], [12.2, 1], [12.5, 2]])).toEqual(["fire", null, "clear"]);
  });

  it("converts thresholds between display units and raw metric", () => {
    expect(fromDisplay(212, "°C", "imperial")).toBeCloseTo(100);
    expect(fromDisplay(60, "km/h", "imperial")).toBeCloseTo(96.56, 2);
    expect(fromDisplay(5, "rpm", "imperial")).toBe(5);
    expect(deltaToDisplay(5, "°C", "imperial")).toBeCloseTo(9);
    expect(deltaFromDisplay(9, "°C", "imperial")).toBeCloseTo(5);
  });
});
