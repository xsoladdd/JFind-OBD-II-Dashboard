import { describe, expect, it } from "vitest";
import { engineAt, rng, SIM_GEARS } from "../sim/engine";
import { GearLearner, gearFor, gearRatios, learn, sanitizeClusters } from "./gear";

/** Speed readings as an adapter gives them (whole km/h, ~1.4 per second) with the RPM read next to each. */
function drive(learner: GearLearner, seconds: number, at: (t: number) => { rpm: number; speed: number }) {
  const out: { t: number; speed: number; gear: number | undefined }[] = [];
  for (let ms = 0; ms < seconds * 1000; ms += 700) {
    const { rpm, speed } = at(ms / 1000);
    const kmh = Math.round(speed);
    out.push({ t: ms, speed: kmh, gear: learner.sample(ms, Math.round(rpm * 4) / 4, kmh) });
  }
  return out;
}

describe("gear estimate", () => {
  it("learns the demo car's five gears from its RPM and speed, then names them", () => {
    const rand = rng(5);
    const learner = new GearLearner();
    drive(learner, 600, (t) => engineAt(t, rand)); // ten demo cycles
    const ratios = gearRatios(learner.clusters);
    expect(ratios).toHaveLength(SIM_GEARS.length);
    ratios.forEach((r, i) => expect(r / SIM_GEARS[i]!).toBeCloseTo(1, 1));
    expect(learner.changed).toBe(true);

    const later = drive(learner, 60, (t) => engineAt(600 + t, rand));
    const cruise = later.filter((s) => s.t > 26_000 && s.t < 39_000); // 90 km/h in 5th
    expect(cruise.every((s) => s.gear === 5)).toBe(true);
    expect(later.filter((s) => s.speed === 0).every((s) => s.gear === undefined)).toBe(true); // stopped: no gear
  });

  it("shows no gear with the clutch in, coasting in neutral, or while still learning", () => {
    const learner = new GearLearner();
    expect(learner.sample(0, 2400, 20)).toBeUndefined(); // nothing learned yet
    for (let i = 0; i < 20; i++) learner.clusters = learn(learn(learner.clusters, 120), 45);
    expect(learner.sample(1000, 2400, 20)).toBe(1);
    expect(learner.sample(2000, 1600, 20)).toBeUndefined(); // clutch in: rpm falls, speed doesn't
    expect(learner.sample(3000, 800, 50)).toBeUndefined(); // coasting in neutral at idle
    expect(learner.sample(4000, 2250, 50)).toBe(2);
  });

  it("merges clusters that drift together, and picks the nearest gear", () => {
    expect(learn([{ ratio: 100, n: 1 }, { ratio: 107, n: 1 }], 103)).toEqual([{ ratio: (101.5 * 2 + 107) / 3, n: 3 }]) // weighted by samples;
    expect(gearFor([120, 68, 45], 70)).toBe(2);
    expect(gearFor([120, 68, 45], 90)).toBeUndefined();
  });

  it("keeps only well-formed saved clusters", () => {
    expect(sanitizeClusters([{ ratio: 40, n: 9 }, { ratio: -1, n: 3 }, { ratio: "x" }, null])).toEqual([{ ratio: 40, n: 9 }]);
    expect(sanitizeClusters("oops")).toEqual([]);
  });
});
