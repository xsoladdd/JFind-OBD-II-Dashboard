import { describe, expect, it } from "vitest";
import { ElmClient } from "../elm/ElmClient";
import { PIDS } from "../obd/pids";
import { clearDtcs, readDtcs, readPid, readVin } from "../obd/requests";
import { discoverSupported } from "../obd/supported";
import { SimulatorTransport } from "../transport/SimulatorTransport";
import { SIM_DTCS, SIM_VIN } from "./elm327";

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
    for (const id of Object.keys(PIDS)) expect(supported.has(id)).toBe(true);
    for (const id of Object.keys(PIDS)) {
      const v = await readPid(client, id);
      expect(v).toBeGreaterThanOrEqual(PIDS[id]!.min);
      expect(v).toBeLessThanOrEqual(PIDS[id]!.max);
    }
    await expect(client.send("0160")).rejects.toMatchObject({ code: "NO_DATA" });
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
