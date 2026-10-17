import { describe, expect, it } from "vitest";
import { useLive } from "../store/live";
import { startRecording, toCsv } from "./recorder";

describe("recorder", () => {
  it("records new live readings and exports them as CSV", () => {
    useLive.getState().reset();
    const rec = startRecording();
    useLive.getState().record("010C", 812.5, Date.UTC(2026, 0, 1, 12, 0, 0));
    useLive.getState().record("010D", 42, Date.UTC(2026, 0, 1, 12, 0, 1, 250));
    useLive.getState().record("ATRV", 14.1, Date.UTC(2026, 0, 1, 12, 0, 2));
    const rows = rec.stop();
    useLive.getState().record("010C", 900); // after stop: not recorded
    expect(rows).toHaveLength(3);
    expect(toCsv(rows)).toBe(
      [
        "time_iso,elapsed_s,pid,name,value,unit",
        "2026-01-01T12:00:00.000Z,0.000,010C,Engine RPM,812.5,rpm",
        "2026-01-01T12:00:01.250Z,1.250,010D,Vehicle speed,42,km/h",
        "2026-01-01T12:00:02.000Z,2.000,ATRV,Adapter voltage (ATRV),14.1,V",
        "",
      ].join("\n"),
    );
  });

  it("quotes cells with commas and exports an empty session as just the header", () => {
    expect(toCsv([{ t: 0, id: "X,Y", value: 1 }]).split("\n")[1]).toBe('1970-01-01T00:00:00.000Z,0.000,X,Y,"X,Y",1,');
    expect(toCsv([])).toBe("time_iso,elapsed_s,pid,name,value,unit\n");
  });
});
