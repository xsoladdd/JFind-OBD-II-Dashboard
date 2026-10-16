import { describe, expect, it } from "vitest";
import { avgEconomy, avgSpeed, instantEconomy, TripCalc } from "./calc";
import { TripDetector } from "./detect";
import { csvHeader, csvRow, parseSummary, parseTripCsv, summaryJson, tripFileBase } from "./format";
import { fuelFlow, mafToLph, PETROL_DENSITY_G_PER_L, PETROL_STOICH_AFR } from "./fuel";
import { analyzeRun, KMH_60MPH, PerfTimer, QUARTER_MILE_M, type SpeedSample } from "./perf";
import { decimate, fitRoute, rampColor } from "./route";

/** Constant acceleration `a` (km/h per s) from 0, sampled every `dtMs`, for `secs`. */
const accel = (a: number, secs: number, dtMs: number, t0 = 0): SpeedSample[] => {
  const out: SpeedSample[] = [];
  for (let t = 0; t <= secs * 1000; t += dtMs) out.push({ t: t0 + t, v: (a * t) / 1000 });
  return out;
};

describe("distance integration", () => {
  it("integrates constant speed exactly and splits moving/idle", () => {
    const c = new TripCalc();
    for (let s = 0; s <= 60; s++) c.addSpeed(s * 1000, 60); // 60 km/h for 60 s = 1 km
    for (let s = 61; s <= 70; s++) c.addSpeed(s * 1000, 0); // 1 s ramp down, then 9 s idle
    expect(c.stats.distanceKm).toBeCloseTo(1 + 30 / 3600, 9);
    expect(c.stats.movingMs).toBe(61_000);
    expect(c.stats.idleMs).toBe(9_000);
    expect(avgSpeed(c.stats)).toBeCloseTo((1 + 30 / 3600) / (61 / 3600), 6);
  });

  it("integrates a linear ramp exactly (trapezoid) and skips dropouts", () => {
    const c = new TripCalc();
    for (let s = 0; s <= 10; s++) c.addSpeed(s * 1000, s * 10); // 0→100 km/h in 10 s: 500/3.6 m
    expect(c.stats.distanceKm * 1000).toBeCloseTo(500 / 3.6, 6);
    c.addSpeed(20_000, 100); // 10 s gap: not integrated
    expect(c.stats.distanceKm * 1000).toBeCloseTo(500 / 3.6, 6);
  });
});

describe("fuel flow", () => {
  it("prefers 015E as-is", () => {
    expect(fuelFlow({ fuelRate: 6.5, maf: 20, fuelType: "diesel" })).toEqual({ lph: 6.5, source: "015E" });
  });
  it("estimates from MAF for petrol with the documented constants", () => {
    const f = fuelFlow({ maf: 10, fuelType: "petrol" })!;
    expect(f.source).toBe("estimate");
    expect(f.lph).toBeCloseTo((10 * 3600) / (PETROL_STOICH_AFR * PETROL_DENSITY_G_PER_L), 9);
    expect(mafToLph(10)).toBeCloseTo(3.2872, 4); // 36000 / (14.7 × 745)
  });
  it("gives no MAF number for diesel, other, or no profile", () => {
    expect(fuelFlow({ maf: 10, fuelType: "diesel" })).toBeNull();
    expect(fuelFlow({ maf: 10, fuelType: "other" })).toBeNull();
    expect(fuelFlow({ maf: 10, fuelType: null })).toBeNull();
  });
  it("integrates fuel and computes economy", () => {
    const c = new TripCalc();
    for (let s = 0; s <= 3600; s += 1) {
      c.addSpeed(s * 1000, 100);
      c.addFlow(s * 1000, 6, "015E");
    }
    expect(c.stats.fuelL).toBeCloseTo(6, 6);
    expect(avgEconomy(c.stats)).toBeCloseTo(6, 6); // 6 L over 100 km
    expect(instantEconomy(6, 100)).toBe(6);
    expect(instantEconomy(0.8, 0)).toBeNull();
    c.addFlow(3601_000, 6, "estimate");
    expect(c.stats.fuelSource).toBe("estimate");
  });
});

describe("performance timer crossings", () => {
  it("interpolates 0–100, 0–60 mph and the quarter mile between samples", () => {
    // 10 km/h per s, sampled at 3 Hz-ish (333 ms) so thresholds fall between samples.
    const r = analyzeRun(accel(10, 30, 333));
    expect(r.to100).toBeCloseTo(10, 6);
    expect(r.to60mph).toBeCloseTo(KMH_60MPH / 10, 6);
    // d = ½·a·t² with a = 10/3.6 m/s² → t = √(2·402.336·3.6/10)
    const tq = Math.sqrt((2 * QUARTER_MILE_M * 3.6) / 10);
    expect(r.quarter!.s).toBeCloseTo(tq, 1);
    expect(r.quarter!.trapKmh).toBeCloseTo(10 * tq, 0);
    expect(r.hz).toBeCloseTo(3.003, 2);
  });

  it("times 100–0 braking and its distance", () => {
    // Up to 120 km/h, then −40 km/h per s to 0, sampled at 250 ms.
    const up = accel(20, 6, 250);
    const t1 = up[up.length - 1]!.t;
    const down: SpeedSample[] = [];
    for (let t = 250; t <= 3000; t += 250) down.push({ t: t1 + t, v: Math.max(0, 120 - (40 * t) / 1000) });
    const r = analyzeRun([...up, ...down]);
    expect(r.brake!.s).toBeCloseTo(2.5, 6);
    expect(r.brake!.m).toBeCloseTo((100 / 3.6) * 2.5 * 0.5, 6); // ½·v·t
  });

  it("starts hands-free on moving off and stops on standstill", () => {
    const p = new PerfTimer();
    p.arm();
    expect(p.sample({ t: 0, v: 0 })).toBeNull();
    expect(p.ready).toBe(true);
    expect(p.sample({ t: 200, v: 3 })).toBeNull();
    expect(p.phase).toBe("running");
    p.sample({ t: 400, v: 6 });
    const done = p.sample({ t: 600, v: 0 })!;
    expect(done.map((s) => s.t)).toEqual([0, 200, 400, 600]);
    expect(p.phase).toBe("armed");
    expect(p.ready).toBe(true);
  });

  it("does not start when armed while already moving", () => {
    const p = new PerfTimer();
    p.arm();
    p.sample({ t: 0, v: 40 });
    p.sample({ t: 200, v: 42 });
    expect(p.phase).toBe("armed");
    expect(p.ready).toBe(false);
  });
});

describe("trip start/stop detection", () => {
  it("starts on movement and ends after the stop timeout or on disconnect", () => {
    const d = new TripDetector(60_000);
    expect(d.speed(0, 0)).toBeNull();
    expect(d.speed(1000, 5)).toBe("start");
    expect(d.speed(2000, 30)).toBeNull();
    expect(d.speed(30_000, 0)).toBeNull();
    expect(d.tick(61_999)).toBeNull();
    expect(d.tick(62_000)).toBe("end");
    expect(d.speed(70_000, 10)).toBe("start");
    expect(d.disconnect()).toBe("end");
    expect(d.disconnect()).toBeNull();
  });
});

describe("trip file formats", () => {
  it("names files by UTC start and VIN", () => {
    expect(tripFileBase(Date.UTC(2026, 9, 16, 8, 5, 9, 500), "wvw zzz1jz3w386752")).toBe("2026-10-16T08-05-09Z_WVWZZZ1JZ3W386752");
    expect(tripFileBase(0, null)).toBe("1970-01-01T00-00-00Z_NOVIN");
  });

  it("writes the summary header first and round-trips it", () => {
    const text = summaryJson({
      startedAt: "2026-10-16T08:05:09.500Z", endedAt: null, vin: null, durationS: 0, distanceKm: 0, movingMs: 0,
      idleMs: 0, fuelL: 0, fuelSource: null, columns: [], gps: false,
    });
    expect(text.replace(/\s/g, "").startsWith('{"format":"obd-dash-trip","version":1,"startedAt":"2026-10-16T08:05:09.500Z","endedAt":null,"vin":null')).toBe(true);
    expect(parseSummary(text)?.version).toBe(1);
    expect(parseSummary('{"format":"other"}')).toBeNull();
    expect(parseSummary("not json")).toBeNull();
  });

  it("writes and parses the CSV, with GPS and empty cells", () => {
    const cols = [{ id: "010D", name: "Vehicle speed", unit: "km/h" }, { id: "010C", name: "Engine RPM", unit: "rpm" }];
    const t0 = Date.UTC(2026, 9, 16);
    const text =
      csvHeader(cols, true) +
      csvRow(t0, t0, [12, 1500.25], true, { lat: 59.329323, lon: 18.068581, accuracy: 7.4 }) +
      csvRow(t0 + 1000, t0, [14, undefined], true, null) +
      "2026-10-16T00:00:02.000Z,2.0,1"; // torn last line from a crash
    expect(text.split("\n")[0]).toBe("time_iso,elapsed_s,010D,010C,lat,lon,accuracy_m");
    expect(text.split("\n")[1]).toBe("2026-10-16T00:00:00.000Z,0.0,12,1500.25,59.329323,18.068581,7");
    const d = parseTripCsv(text);
    expect(d.t).toEqual([t0, t0 + 1000]);
    expect(d.cols["010D"]).toEqual([12, 14]);
    expect(d.cols["010C"]).toEqual([1500.25, null]);
    expect(d.cols.lat).toEqual([59.329323, null]);
  });
});

describe("route projection", () => {
  it("fits the route into the box, north up, with a round scale bar", () => {
    // ~1.11 km north-south at the equator.
    const f = fitRoute([{ lat: 0, lon: 0 }, { lat: 0.01, lon: 0 }], 400, 300, 20);
    const [[x0, y0], [x1, y1]] = f.xy as [[number, number], [number, number]];
    expect(x0).toBeCloseTo(200, 6);
    expect(x1).toBeCloseTo(200, 6);
    expect(y1).toBeLessThan(y0); // north is up
    expect(y0 - y1).toBeCloseTo(260, 6); // fills the height minus padding
    expect(f.scale).toBeCloseTo(260 / 1111.95, 3);
    // ¼ of 360 px ≈ 385 m → 200 m bar
    expect(f.bar.label).toBe("200 m");
    expect(f.bar.px).toBeCloseTo(200 * f.scale, 6);
    expect(fitRoute([{ lat: 0, lon: 0 }, { lat: 0.01, lon: 0 }], 400, 300, 20, "imperial").bar.label).toBe("1000 ft");
  });

  it("shrinks longitude by cos(latitude) and handles a single point", () => {
    const f = fitRoute([{ lat: 60, lon: 0 }, { lat: 60, lon: 0.02 }], 400, 400, 0);
    const [[x0], [x1]] = f.xy as [[number, number], [number, number]];
    expect((x1 - x0) / f.scale).toBeCloseTo(6_371_008.8 * ((0.02 * Math.PI) / 180) * Math.cos((60 * Math.PI) / 180), 0);
    expect(fitRoute([{ lat: 1, lon: 1 }], 100, 100, 10).xy).toEqual([[50, 50]]);
  });

  it("decimates and colours", () => {
    expect(decimate(10, 4)).toEqual([0, 3, 6, 9]);
    expect(decimate(11, 4)).toEqual([0, 3, 6, 9, 10]);
    expect(rampColor(0, 0, 100)).toBe("#3987e5");
    expect(rampColor(100, 0, 100)).toBe("#d9403a");
  });
});
