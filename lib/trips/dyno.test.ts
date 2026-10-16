import { describe, expect, it } from "vitest";
import { engineAt, rng } from "../sim/engine";
import { SIM_DYNO_MASS_KG, SIM_KMH_PER_RPM, pullState, simPull, simWheelW, withPull } from "../sim/dyno";
import {
  aeroW,
  analyzePull,
  DynoRecorder,
  EXAMPLE_CDA_M2,
  EXAMPLE_CRR,
  fitRatio,
  G,
  powerW,
  RHO_ISA,
  rollingW,
  smoothDeriv,
  tyreRadiusM,
  type Pt,
  type Pull,
} from "./dyno";

const K = 0.02; // km/h per rpm

/** Readings of a true speed curve v(t) (km/h) as an adapter gives them: jittered times, 0.25 rpm and whole km/h. */
function sample(vKmh: (tS: number) => number, durS: number, k = () => K, rpmHz = 8, speedHz = 4, seed = 3): Pull {
  const r = rng(seed);
  const pts = (hz: number, f: (tS: number) => number) => {
    const out: Pt[] = [];
    for (let t = 0; t <= durS; t += 1 / hz) {
      const tj = t + (r() - 0.5) * (0.4 / hz);
      out.push({ t: tj * 1000, v: f(tj) });
    }
    return out;
  };
  return {
    rpm: pts(rpmHz, (t) => Math.round((vKmh(t) / k()) * 4) / 4),
    speed: pts(speedHz, (t) => Math.round(vKmh(t))),
  };
}

describe("fitRatio", () => {
  it("finds a single gear's ratio from whole-km/h speeds", () => {
    const rpm = Array.from({ length: 40 }, (_, i) => 2000 + i * 100);
    const f = fitRatio(rpm, rpm.map((r) => Math.round(r * K)));
    expect(f.ok).toBe(true);
    expect(f.k).toBeCloseTo(K, 4);
    expect(f.worstKmh).toBeLessThanOrEqual(0.5);
  });

  it("rejects a gear change (ratio step) halfway", () => {
    const rpm = Array.from({ length: 40 }, (_, i) => 3000 + (i % 20) * 150);
    const kmh = rpm.map((r, i) => Math.round(r * (i < 20 ? K : K * 1.3)));
    const f = fitRatio(rpm, kmh);
    expect(f.ok).toBe(false);
    expect(f.reason).toMatch(/gear change/);
  });

  it("rejects clutch slip (RPM flares, speed doesn't follow)", () => {
    const rpm = Array.from({ length: 30 }, (_, i) => 2500 + i * 100);
    const kmh = rpm.map((r, i) => Math.round((i > 10 && i < 16 ? r - 600 : r) * K));
    expect(fitRatio(rpm, kmh).ok).toBe(false);
  });

  it("needs readings above the minimum speed", () => {
    expect(fitRatio([800, 900, 1000], [1, 2, 3]).ok).toBe(false);
  });
});

describe("smoothDeriv", () => {
  it("is exact on a quadratic, with uneven sample times", () => {
    const r = rng(5);
    const t = Array.from({ length: 30 }, (_, i) => i * 0.15 + r() * 0.05);
    const s = smoothDeriv(t, t.map((x) => 3 + 2 * x - 0.5 * x * x));
    t.forEach((x, i) => {
      expect(s.y[i]).toBeCloseTo(3 + 2 * x - 0.5 * x * x, 9);
      expect(s.dy[i]).toBeCloseTo(2 - x, 9);
    });
  });

  it("refuses fewer than five points", () => {
    expect(() => smoothDeriv([0, 1, 2], [0, 1, 2])).toThrow();
  });
});

describe("loss terms", () => {
  it("rolling = Crr·m·g·v and aero = ½·ρ·CdA·v³", () => {
    expect(rollingW(1500, 20, 0.01)).toBeCloseTo(0.01 * 1500 * 9.80665 * 20, 9);
    expect(aeroW(20, 0.65)).toBeCloseTo(0.5 * 1.225 * 0.65 * 8000, 9);
    expect(G).toBe(9.80665);
    expect(RHO_ISA).toBe(1.225);
  });

  it("adds both to m·a·v, or nothing with losses off", () => {
    const l = { crr: EXAMPLE_CRR, cdaM2: EXAMPLE_CDA_M2 };
    expect(powerW(1500, 20, 2, null)).toBe(60_000);
    expect(powerW(1500, 20, 2, l)).toBeCloseTo(60_000 + rollingW(1500, 20, l.crr) + aeroW(20, l.cdaM2), 9);
  });
});

describe("analyzePull", () => {
  it("recovers constant power within 5 % (v = √(v0² + 2Pt/m), no losses)", () => {
    const P = 60_000;
    const m = 1400;
    const v0 = 40 / 3.6;
    const pull = sample((t) => Math.sqrt(v0 * v0 + (2 * P * t) / m) * 3.6, 8);
    const a = analyzePull(pull, m, null);
    if (!a.ok) throw new Error(a.reason);
    expect(a.result.kmhPer1000).toBeCloseTo(K * 1000, 1);
    const inner = a.result.curve; // every point: the smoothing edges are left out
    for (const p of inner) expect(Math.abs(p.w - P) / P).toBeLessThan(0.05);
    // engine-equivalent torque = P / ω, tractive force = P / v
    for (const p of inner) {
      expect(p.nm).toBeCloseTo(p.w / ((2 * Math.PI * p.rpm) / 60), 6);
      expect(p.n).toBeCloseTo(p.w / ((p.rpm * a.result.kmhPer1000) / 3600), 6);
    }
    expect(a.result.rpmHz).toBeGreaterThan(7);
    expect(a.result.speedHz).toBeGreaterThan(3);
  });

  it("rejects a pull with a gear change", () => {
    const pull = sample((t) => 40 + 8 * t, 8, () => K);
    pull.speed = pull.speed.map((s) => (s.t > 4000 ? { ...s, v: Math.round(s.v * 1.3) } : s));
    const a = analyzePull(pull, 1400, null);
    expect(a.ok ? "" : a.reason).toMatch(/gear change/);
  });

  it("estimates the demo car's wheel power from a simulated pull", () => {
    simPull(0);
    const pull: Pull = { rpm: [], speed: [] };
    for (let t = 3000; t < 40_000; t += 60) {
      const s = pullState(t);
      if (!s || s.throttle < 100) continue;
      const read = t % 120 === 0 ? pull.speed : pull.rpm; // the adapter reads them in turn
      read.push({ t, v: read === pull.speed ? Math.round(s.kmh) : Math.round((s.kmh / SIM_KMH_PER_RPM) * 4) / 4 });
    }
    const a = analyzePull(pull, SIM_DYNO_MASS_KG, { crr: EXAMPLE_CRR, cdaM2: EXAMPLE_CDA_M2 });
    if (!a.ok) throw new Error(a.reason);
    const truePeak = Math.max(...Array.from({ length: 4500 }, (_, i) => simWheelW(2000 + i)));
    expect(Math.abs(a.result.peakPower.w - truePeak) / truePeak).toBeLessThan(0.05);
    expect(a.result.kmhPer1000).toBeCloseTo(SIM_KMH_PER_RPM * 1000, 1);
  });
});

describe("DynoRecorder", () => {
  const feed = (rec: DynoRecorder, rpm: (tS: number) => number, durS: number) => {
    const out: Pull[] = [];
    for (let t = 0; t <= durS * 1000; t += 100) {
      rec.addSpeed({ t, v: Math.round(rpm(t / 1000) * K) });
      const p = rec.addRpm({ t: t + 50, v: rpm(t / 1000) });
      if (p) out.push(p);
    }
    return out;
  };

  it("hands back the climb, trimmed of the cruise before it, when RPM drops", () => {
    const rec = new DynoRecorder();
    rec.arm();
    // cruise 2000 for 3 s, pull to 6000 by 9 s, then lift off
    const pulls = feed(rec, (t) => (t < 3 ? 2000 : t < 9 ? 2000 + ((t - 3) / 6) * 4000 : 6000 - (t - 9) * 800), 12);
    expect(pulls).toHaveLength(1);
    const p = pulls[0]!;
    expect(p.rpm[0]!.t).toBeGreaterThanOrEqual(2900);
    expect(p.rpm[p.rpm.length - 1]!.v).toBeCloseTo(6000, 0);
    expect(p.speed.length).toBeGreaterThan(50);
    expect(rec.armed).toBe(true); // re-armed for the next pull
  });

  it.each([
    ["idle", 5_000, 1],
    ["acceleration", 12_000, 3],
    ["acceleration", 18_000, 3],
    ["cruise", 30_000, 1],
    ["braking", 44_000, 2],
  ])("spots the Demo pull started during %s in the simulated drive cycle (%i ms, seed %i)", (_, startMs, seed) => {
    const rec = new DynoRecorder();
    rec.arm();
    const r = rng(seed);
    const jitter = rng(seed + 10);
    const T0 = 1_000_000;
    simPull(T0 + startMs);
    const found: Pull[] = [];
    // uneven reads with a gap every 9th, as when slower PIDs are polled in between
    for (let t = T0, n = 0; t < T0 + startMs + 25_000; t += 40 + jitter() * 80 + (n % 9 === 0 ? 250 : 0), n++) {
      const e = withPull(engineAt((t - T0) / 1000, r), t);
      if (n % 2) rec.addSpeed({ t, v: Math.round(e.speed) });
      else {
        const p = rec.addRpm({ t, v: Math.round(e.rpm * 4) / 4 });
        if (p) found.push(p);
      }
    }
    expect(found).toHaveLength(1);
    const first = found[0]!.rpm[0]!.v; // trimmed to the first reading after the throttle opened at 2000 rpm
    expect(first).toBeGreaterThan(2000);
    expect(first).toBeLessThan(2300); // one reading interval (up to ~0.4 s here) into the pull
    const a = analyzePull(found[0]!, SIM_DYNO_MASS_KG, { crr: EXAMPLE_CRR, cdaM2: EXAMPLE_CDA_M2 });
    if (!a.ok) throw new Error(a.reason);
    // no ramp-up from the steady part before the pull: the curve is right from its first point
    for (const p of a.result.curve) expect(Math.abs(p.w - simWheelW(p.rpm)) / simWheelW(p.rpm)).toBeLessThan(0.1);
  });

  it("ignores short or small climbs, and does nothing disarmed", () => {
    const rec = new DynoRecorder();
    rec.arm();
    expect(feed(rec, (t) => (t < 2 ? 2000 + t * 300 : 2600 - t * 100), 6)).toHaveLength(0);
    rec.disarm();
    expect(feed(rec, (t) => (t < 9 ? 2000 + t * 500 : 1000), 12)).toHaveLength(0);
  });
});

describe("tyreRadiusM", () => {
  it("reads ISO metric sizes", () => {
    expect(tyreRadiusM("205/55 R16")).toBeCloseTo((16 * 25.4) / 2000 + 0.20 * 0.55 * 1.025, 4);
    expect(tyreRadiusM("225/40ZR18 92W")).toBeCloseTo(0.2286 + 0.09, 4);
    expect(tyreRadiusM("")).toBeNull();
    expect(tyreRadiusM("31x10.5R15")).toBeNull();
  });
});
