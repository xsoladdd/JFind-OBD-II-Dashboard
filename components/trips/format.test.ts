import { describe, expect, it } from "vitest";
import { disp, fmtDuration, tripState } from "./format";

describe("trip formatting", () => {
  it("formats durations and missing values", () => {
    expect(fmtDuration(65_000)).toBe("1:05");
    expect(fmtDuration(3_725_000)).toBe("1:02:05");
    expect(disp(null, "km", "metric")).toEqual(["--", "km"]);
  });

  it("names the recorder state with one word, recording first", () => {
    expect(tripState({ recording: true, watching: true, autoRecord: true }).word).toBe("Recording");
    expect(tripState({ recording: false, watching: true, autoRecord: true }).word).toBe("Ready");
    expect(tripState({ recording: false, watching: false, autoRecord: false }).word).toBe("Auto-record off");
    expect(tripState({ recording: false, watching: false, autoRecord: true }).word).toBe("Not connected");
  });
});
