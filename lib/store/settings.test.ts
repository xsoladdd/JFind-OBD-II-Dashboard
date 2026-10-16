import { describe, expect, it } from "vitest";
import { sanitizeDriveExtras } from "./settings";

describe("sanitizeDriveExtras", () => {
  it("keeps at most two unique PID ids", () => {
    expect(sanitizeDriveExtras(["0105", "0105", "", 7, "012F", "0111"])).toEqual(["0105", "012F"]);
  });

  it("falls back to coolant and fuel for a value of the wrong shape, and allows an empty choice", () => {
    expect(sanitizeDriveExtras("oops")).toEqual(["0105", "012F"]);
    expect(sanitizeDriveExtras([])).toEqual([]);
  });

  it("returns the same array for the same stored value", () => {
    const stored = ["0105"];
    expect(sanitizeDriveExtras(stored)).toBe(sanitizeDriveExtras(stored));
  });
});
