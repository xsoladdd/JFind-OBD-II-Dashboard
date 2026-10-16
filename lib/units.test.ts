import { describe, expect, it } from "vitest";
import { toDisplay } from "./units";

describe("toDisplay", () => {
  it("keeps metric values as they are", () => {
    expect(toDisplay(100, "km/h", "metric")).toEqual({ value: 100, unit: "km/h" });
  });

  it("converts to imperial", () => {
    expect(toDisplay(100, "km/h", "imperial").value).toBeCloseTo(62.137, 3);
    expect(toDisplay(100, "°C", "imperial")).toEqual({ value: 212, unit: "°F" });
    expect(toDisplay(-40, "°C", "imperial").value).toBe(-40);
    expect(toDisplay(101.325, "kPa", "imperial").value).toBeCloseTo(14.696, 3);
    expect(toDisplay(3.785411784, "L/h", "imperial")).toEqual({ value: 1, unit: "gal/h" });
    expect(toDisplay(1.609344, "km", "imperial")).toEqual({ value: 1, unit: "mi" });
    expect(toDisplay(10, "L/100km", "imperial").value).toBeCloseTo(23.52, 2);
  });

  it("leaves units without an imperial form alone", () => {
    expect(toDisplay(3000, "rpm", "imperial")).toEqual({ value: 3000, unit: "rpm" });
    expect(toDisplay(12, "g/s", "imperial")).toEqual({ value: 12, unit: "g/s" });
  });
});
