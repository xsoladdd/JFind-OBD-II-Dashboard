import { describe, expect, it } from "vitest";
import { ElmClient, ElmError } from "../elm/ElmClient";
import { readDtcs, readVin } from "../obd/requests";
import { SIM_DTCS, SIM_VIN } from "../sim/elm327";
import { SIM_CALID, SIM_CVN, SIM_TCM_DTCS } from "../sim/advanced";
import { SimulatorTransport } from "../transport/SimulatorTransport";
import { classify, measure, sampleMin } from "./battery";
import { canIdChars, ecuLabel, readPerEcu, splitByEcu, withHeaders } from "./headers";
import { midName, parseMode06, readMode06, scaleUas } from "./mode06";
import { mode09Data, parseCalIds, parseEcuName, parseIpt, readVehicleInfo } from "./mode09";

async function connectSim(chunkSize: number | [number, number] = [1, 20]) {
  const sim = new SimulatorTransport({ chunkSize, delayMs: 0, seed: 3 });
  const client = new ElmClient(sim, { reconnectDelayMs: 1 });
  await client.connect();
  return { sim, client };
}

describe("Mode 06", () => {
  it("scales the UASIDs in the table, signed ones as two's complement", () => {
    expect(scaleUas(0x01, 1234)).toBe(1234);
    expect(scaleUas(0x0b, 720)).toBeCloseTo(0.72);
    expect(scaleUas(0x0a, 1000)).toBeCloseTo(122);
    expect(scaleUas(0x07, 3000)).toBe(750);
    expect(scaleUas(0x16, 0)).toBeCloseTo(-40);
    expect(scaleUas(0x16, 1000)).toBeCloseTo(60);
    expect(scaleUas(0x20, 0x80)).toBeCloseTo(0.5);
    expect(scaleUas(0x8b, 0xffff)).toBeCloseTo(-0.001);
    expect(scaleUas(0x81, 0x8000)).toBe(-32768);
    expect(scaleUas(0x0b, 0xffff)).toBeCloseTo(65.535); // unsigned twin of 0x8B
    expect(scaleUas(0x3f, 0x0140)).toBe(0x0140); // not in the table: raw
  });

  it("parses 9-byte records, pass/fail and unknown UASIDs", () => {
    const [ok, fail, raw] = parseMode06(["46 01 81 0B 02 D0 02 58 04 4C 01 82 0B 07 00 02 58 04 4C 01 83 3F 00 05 00 00 00 03"]);
    expect(ok).toMatchObject({ mid: 1, tid: 0x81, unit: "V", pass: true });
    expect(ok!.value).toBeCloseTo(0.72);
    expect(fail).toMatchObject({ tid: 0x82, pass: false });
    expect(raw).toMatchObject({ uasid: 0x3f, unit: null, value: 5, min: 0, max: 3, pass: false });
  });

  it("names standard MIDs only", () => {
    expect(midName(0x01)).toBe("O2 Sensor Monitor Bank 1 - Sensor 1");
    expect(midName(0x06)).toBe("O2 Sensor Monitor Bank 2 - Sensor 2");
    expect(midName(0x21)).toBe("Catalyst Monitor Bank 1");
    expect(midName(0xa2)).toBe("Misfire Cylinder 1 Data");
    expect(midName(0x5a)).toBe("MID 0x5A");
  });

  it("walks the MID bitmasks and reads every test from the simulator", async () => {
    const { client } = await connectSim();
    const tests = await readMode06(client);
    expect(tests.map((t) => `${t.mid.toString(16)}/${t.tid.toString(16)}`)).toEqual(["1/81", "1/82", "21/80", "21/81", "a2/b", "a2/c"]);
    expect(tests.filter((t) => !t.pass).map((t) => t.mid)).toEqual([0x21]);
  });
});

describe("header mode (ATH1)", () => {
  it("knows the CAN ID width per protocol", () => {
    expect(canIdChars("A6")).toBe(3);
    expect(canIdChars("8")).toBe(3);
    expect(canIdChars("A7")).toBe(8);
    expect(canIdChars("3")).toBeNull();
  });

  it("splits single frames per ECU, with or without spaces, and drops CAN padding", () => {
    const m = splitByEcu(["7E8 04 43 01 01 33 00 00 00", "7E9044301070000000000"], 3);
    expect([...m.keys()]).toEqual(["7E8", "7E9"]);
    expect(m.get("7E8")).toEqual(["43010133"]);
    expect(m.get("7E9")).toEqual(["43010700"]);
  });

  it("reassembles multi-frame replies per ECU even when frames interleave, 29-bit IDs too", () => {
    const vin = [..."ABCDEFGHJKLMNPRST"].map((c) => c.charCodeAt(0).toString(16).toUpperCase());
    const payload = ["49", "02", "01", ...vin]; // 20 bytes
    const lines = [
      `18DAF110 10 14 ${payload.slice(0, 6).join(" ")}`,
      "18DAF118 02 43 00",
      `18DAF110 21 ${payload.slice(6, 13).join(" ")}`,
      `18DAF110 22 ${payload.slice(13, 20).join(" ")}`,
    ];
    const m = splitByEcu(lines, 8);
    expect(m.get("18DAF110")).toEqual([payload.join("")]);
    expect(m.get("18DAF118")).toEqual(["4300"]);
    expect(ecuLabel("18DAF110").label).toBe("ECU 0x10");
    expect(ecuLabel("7E9")).toEqual({ label: "ECU #2", hint: "usually Transmission [verify]" });
  });

  it("reads DTCs, VIN and names per ECU from the simulator, then header-less reads work again", async () => {
    const { client } = await connectSim();
    const ecus = await readPerEcu(client, "A6");
    expect(ecus.map((e) => [e.id, e.name, e.vin, e.stored])).toEqual([
      ["7E8", "ECM-EngineControl", SIM_VIN, SIM_DTCS.stored],
      ["7E9", "TCM-TransmissionCtl", "", SIM_TCM_DTCS],
    ]);
    expect(ecus[0]!.pending).toEqual(SIM_DTCS.pending);
    expect(await readDtcs(client, "03")).toEqual(SIM_DTCS.stored);
    expect(await readVin(client)).toBe(SIM_VIN);
  });

  it("refuses non-CAN protocols without touching ATH", async () => {
    const sent: string[] = [];
    const fake = { send: async (c: string) => (sent.push(c), []) };
    await expect(readPerEcu(fake, "A3")).rejects.toThrow(/CAN/);
    expect(sent).toEqual([]);
  });

  it("always restores ATH0: after success, after a timeout, and when ATH1 itself fails", async () => {
    const run = async (failOn: string | null, fn: (c: { send: (cmd: string) => Promise<string[]> }) => Promise<unknown>) => {
      const sent: string[] = [];
      const c = {
        send: async (cmd: string) => {
          sent.push(cmd);
          if (cmd === failOn) throw new ElmError("TIMEOUT", cmd);
          return ["OK"];
        },
      };
      const result = await withHeaders(c, () => fn(c)).catch((e: unknown) => e);
      return { sent, result };
    };
    expect(await run(null, async (c) => c.send("03"))).toEqual({ sent: ["ATH1", "03", "ATH0"], result: ["OK"] });
    const timedOut = await run("03", async (c) => c.send("03"));
    expect(timedOut.sent).toEqual(["ATH1", "03", "ATH0"]);
    expect(timedOut.result).toMatchObject({ code: "TIMEOUT", command: "03" });
    expect((await run("ATH1", async () => {})).sent).toEqual(["ATH1", "ATH0"]);
  });

  it("restores ATH0 on the simulator after a real client timeout", async () => {
    const { sim, client } = await connectSim();
    const write = sim.write.bind(sim);
    sim.write = async (t: string) => (t === "03\r" ? undefined : write(t)); // the adapter swallows this one command
    await expect(withHeaders(client, () => client.send("03", { timeoutMs: 50 }))).rejects.toMatchObject({ code: "TIMEOUT" });
    expect((await client.send("0100"))[0]).not.toMatch(/^7E8/);
  });
});

describe("Mode 09", () => {
  it("decodes CAN multi-frame and legacy multi-line replies", () => {
    expect(parseCalIds(["013", "0: 49 04 01 41 42 43", "1: 44 00 00 00 00 00 00", "2: 00 00 00 00 00 00 00"])).toEqual(["ABCD"]);
    const legacy = ["49 04 02 45 46 47 48", "49 04 01 41 42 43 44", "49 04 03 00 00 00 00", "49 04 04 00 00 00 00"];
    expect(parseCalIds(legacy)).toEqual(["ABCDEFGH"]);
    expect(mode09Data(["49 06 01 1A 2B 3C 4D"], 6)).toEqual([0x1a, 0x2b, 0x3c, 0x4d]);
    expect(parseEcuName(["017", "0: 49 0A 01 45 43 4D", "1: 00 2D 45 6E 67 69 6E", "2: 65 00 00 00 00 00 00", "3: 00 00 00 00 00 00 00"])).toBe("ECM-Engine");
    expect(parseIpt(["49 0B 02 00 05 01 00"], 0x0b)).toEqual([{ name: "Counter 1", value: 5 }, { name: "Counter 2", value: 256 }]);
  });

  it("reads calibration IDs, CVNs, ECU name and IPT from the simulator", async () => {
    const { client } = await connectSim(2);
    const info = await readVehicleInfo(client);
    expect(info.supported).toEqual([0x02, 0x04, 0x06, 0x08, 0x0a]);
    expect(info).toMatchObject({ calIds: [SIM_CALID], cvns: [SIM_CVN], ecuName: "ECM-EngineControl" });
    expect(info.ipt?.counters.slice(0, 3)).toEqual([
      { name: "OBDCOND", value: 120 },
      { name: "IGNCNTR", value: 340 },
      { name: "CATCOMP1", value: 95 },
    ]);
  });
});

describe("battery test", () => {
  it("classifies on the guidance bands, boundaries included", () => {
    expect(classify("resting", 12.6)).toEqual({ label: "Fully charged", ok: true });
    expect(classify("resting", 12.4).label).toBe("Partly charged");
    expect(classify("resting", 12.0)).toEqual({ label: "Low", ok: false });
    expect(classify("resting", 11.9).label).toBe("Discharged");
    expect(classify("cranking", 9.6).ok).toBe(true);
    expect(classify("cranking", 9.5).ok).toBe(false);
    expect(classify("charging", 13.1).ok).toBe(false);
    expect(classify("charging", 13.2).ok).toBe(true);
    expect(classify("charging", 14.8).ok).toBe(true);
    expect(classify("charging", 14.9).label).toMatch(/High/);
  });

  it("catches the simulator's crank dip and reads resting / charging voltage", async () => {
    const { sim, client } = await connectSim();
    sim.emulator.battery = { state: "off", since: Date.now() };
    expect(await measure(client)).toBeCloseTo(12.5, 0);
    sim.emulator.battery = { state: "cranking", since: Date.now() };
    const crank = await sampleMin(client, 600);
    expect(crank.samples).toBeGreaterThan(1);
    expect(crank.min).toBeLessThan(10.5);
    sim.emulator.battery = { state: "running", since: Date.now() };
    expect(classify("charging", await measure(client)).ok).toBe(true);
  });
});
