import { describe, expect, it } from "vitest";
import { niceTicks } from "./ticks";

describe("niceTicks", () => {
  it("picks round steps inside the range", () => {
    expect(niceTicks(0, 8, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(niceTicks(-40, 130, 8)).toEqual([-40, -20, 0, 20, 40, 60, 80, 100, 120]);
    expect(niceTicks(0, 240, 12)).toEqual([0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240]);
    expect(niceTicks(-40, 266, 8)).toEqual([0, 50, 100, 150, 200, 250]); // imperial coolant
  });
});
