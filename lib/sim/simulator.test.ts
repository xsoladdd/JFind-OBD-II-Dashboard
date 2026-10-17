import { describe, expect, it } from "vitest";
import { ElmClient } from "../elm/ElmClient";
import { cmdOf, PID_LIST } from "../obd/pids";
import { clearDtcs, readDtcs, readPid, readVin } from "../obd/requests";
import { discoverSupported } from "../obd/supported";
import { SimulatorTransport } from "../transport/SimulatorTransport";
import { SIM_DTCS, SIM_VIN } from "./elm327";
import { launchSpeed, simLaunch } from "./trips";
import { analyzeRun } from "../trips/perf";

function connectSim(chunkSize: number | [number, number] = 3) {
  let t = 30;
  const sim = new SimulatorTransport({ chunkSize, delayMs: 0, seed: 42, clock: () => (t += 0.5) });
  return { sim, client: new ElmClient(sim, { reconnectDelayMs: 1 }) };
}

describe("simulator round trip", () => {
  it("initialises like a CAN car", async () => {
    const { client } = connectSim(1);
    expect(await client.connect()).toEqual({ elmVersion: "ELM327 v1.5", protocol: "A6", vehicleError: undefined });
  });

  it("serves bitmasks that match its PIDs, and values inside each PID's range", async () => {
    const { client } = connectSim([1, 20]);
    await client.connect();
    const supported = await discoverSupported(client);
    // The demo car has 4 of the 8 O2 sensors (lib/sim/morePids.ts) and no throttle C / pedal F.
    const absent = ["0116", "0117", "011A", "011B", "011D", "0148", "014B"];
    const cmds = [...new Set(PID_LIST.map(cmdOf))];
    expect(cmds.filter((c) => !supported.has(c))).toEqual(absent);
    expect(supported.has("0161") && supported.has("0163")).toBe(true);
    for (const def of PID_LIST.filter((p) => supported.has(cmdOf(p)))) {
      const v = await readPid(client, def.id);
      if (def.text) {
        expect(def.text(v)).not.toMatch(/^Code /);
        continue;
      }
      expect(v).toBeGreaterThanOrEqual(def.min);
      expect(v).toBeLessThanOrEqual(def.max);
    }
    await expect(client.send("0180")).rejects.toMatchObject({ code: "NO_DATA" });
  });

  it("reads, clears and re-reads DTCs; permanent codes survive", async () => {
    const { client } = connectSim();
    await client.connect();
    expect(await readDtcs(client, "03")).toEqual(SIM_DTCS.stored);
    expect(await readDtcs(client, "07")).toEqual(SIM_DTCS.pending);
    expect(await client.send("020C00")).toHaveLength(1);
    await clearDtcs(client);
    expect(await readDtcs(client, "03")).toEqual([]);
    expect(await readDtcs(client, "07")).toEqual([]);
    expect(await readDtcs(client, "0A")).toEqual(SIM_DTCS.permanent);
    await expect(client.send("020C00")).rejects.toMatchObject({ code: "NO_DATA" });
  });

  it("returns the VIN over a multi-frame reply", async () => {
    const { client } = connectSim(2);
    await client.connect();
    expect(await readVin(client)).toBe(SIM_VIN);
  });

  it("answers raw terminal commands and rejects unknown ones", async () => {
    const { client } = connectSim();
    await client.connect();
    expect((await client.send("ATRV"))[0]).toMatch(/^1\d\.\dV$/);
    await expect(client.send("ATXYZ")).rejects.toMatchObject({ code: "UNKNOWN_COMMAND" });
  });

  it("reconnects and re-runs init after a drop", async () => {
    const { sim, client } = connectSim();
    await client.connect();
    const statuses: string[] = [];
    const done = new Promise<void>((r) => client.onStatus((s) => (statuses.push(s), s === "connected" && r())));
    sim.simulateDrop();
    await done;
    expect(statuses).toEqual(["reconnecting", "connected"]);
    expect(await readPid(client, "010D")).toBeGreaterThanOrEqual(0);
  });
});

describe("trips demo launch", () => {
  it("holds, passes 100 km/h and the quarter mile, then brakes to 0 and ends", () => {
    simLaunch(0);
    const s: { t: number; v: number }[] = [];
    for (let t = 2900; t <= 30_000; t += 100) s.push({ t, v: Math.round(launchSpeed(t)!) });
    const run = s.slice(s.findIndex((p, i) => p.v === 0 && s[i + 1]!.v > 0), s.findLastIndex((p, i) => p.v > 0 && s[i + 1]?.v === 0) + 2);
    const r = analyzeRun(run);
    expect(r.to100).toBeGreaterThan(5);
    expect(r.quarter).toBeDefined();
    expect(r.brake).toBeDefined();
    expect(launchSpeed(60_000)).toBeNull();
  });
});
