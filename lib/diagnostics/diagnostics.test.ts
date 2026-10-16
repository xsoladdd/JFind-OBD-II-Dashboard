import { describe, expect, it } from "vitest";
import { ElmClient, ElmError } from "../elm/ElmClient";
import { describeDtc } from "../obd/dtc";
import { usePollingPause } from "../polling/pause";
import { SIM_DTCS, SIM_VIN } from "../sim/elm327";
import { SimulatorTransport } from "../transport/SimulatorTransport";
import { combineStatus, decodeMonitorStatus } from "./readiness";
import { toCsv, toJson, toReport } from "./report";
import { clearCodes, decodeFreezeValue, readScan, type Scan } from "./scan";
import { clearFile, parseScanFile, readFile, scanFileName } from "./scanFile";

async function connectSim() {
  let t = 30;
  const sim = new SimulatorTransport({ chunkSize: [1, 20], delayMs: 0, seed: 42, clock: () => (t += 0.5) });
  const client = new ElmClient(sim, { reconnectDelayMs: 1 });
  const sent: string[] = [];
  client.onTraffic((e) => e.dir === "tx" && sent.push(e.text));
  await client.connect();
  return { sim, client, sent };
}

const stateOf = (s: ReturnType<typeof decodeMonitorStatus> | null, name: string) =>
  s?.monitors.find((m) => m.name === name)?.state;

describe("readiness bits (SAE J1979 PID 01/41)", () => {
  it("decodes MIL, count and spark-ignition monitors", () => {
    // A: MIL on, 3 codes. B: misfire+fuel available, fuel incomplete. C: catalyst, EVAP, O2. D: EVAP incomplete.
    const s = decodeMonitorStatus([0x83, 0x23, 0x25, 0x04]);
    expect(s).toMatchObject({ mil: true, dtcCount: 3, ignition: "spark" });
    expect(stateOf(s, "Misfire")).toBe("complete");
    expect(stateOf(s, "Fuel system")).toBe("incomplete");
    expect(stateOf(s, "Components")).toBe("unsupported");
    expect(stateOf(s, "Catalyst")).toBe("complete");
    expect(stateOf(s, "Heated catalyst")).toBe("unsupported");
    expect(stateOf(s, "Evaporative system")).toBe("incomplete");
    expect(stateOf(s, "Oxygen sensor")).toBe("complete");
    expect(s.monitors).toHaveLength(11);
  });

  it("switches to the compression-ignition set on B3 and skips reserved bits", () => {
    const s = decodeMonitorStatus([0x00, 0x0f, 0xff, 0x40]);
    expect(s).toMatchObject({ mil: false, dtcCount: 0, ignition: "compression" });
    expect(s.monitors.map((m) => m.name)).toEqual([
      "Misfire",
      "Fuel system",
      "Components",
      "NMHC catalyst",
      "NOx/SCR monitor",
      "Boost pressure",
      "Exhaust gas sensor",
      "PM filter monitoring",
      "EGR and/or VVT system",
    ]);
    expect(stateOf(s, "PM filter monitoring")).toBe("incomplete");
    expect(stateOf(s, "Boost pressure")).toBe("complete");
  });

  it("combines several ECUs: MIL ORed, counts summed, incomplete wins over complete", () => {
    const ecm = decodeMonitorStatus([0x82, 0x07, 0x01, 0x00]);
    const tcm = decodeMonitorStatus([0x01, 0x04, 0x01, 0x01]);
    const s = combineStatus([tcm, ecm])!;
    expect(s).toMatchObject({ mil: true, dtcCount: 3 });
    expect(stateOf(s, "Misfire")).toBe("complete");
    expect(stateOf(s, "Catalyst")).toBe("incomplete");
    expect(stateOf(s, "Heated catalyst")).toBe("unsupported");
    expect(combineStatus([])).toBeNull();
  });
});

describe("DTC descriptions", () => {
  it("looks up bundled generic P0 codes and never guesses the rest", () => {
    expect(describeDtc("P0420")).toBe("Catalyst System Efficiency Below Threshold (Bank 1)");
    expect(describeDtc("p0300")).toBe("Random/Multiple Cylinder Misfire Detected");
    expect(describeDtc("P1234")).toBe("Manufacturer-specific / unknown");
    expect(describeDtc("P0109")).toBe("Manufacturer-specific / unknown"); // conflicting rows in the source, dropped
  });
});

describe("freeze frame decode", () => {
  it("decodes a Mode 02 reply through the Mode 01 registry", () => {
    expect(decodeFreezeValue([0x42, 0x0c, 0x00, 0x1a, 0xf8])).toEqual({ id: "010C", name: "Engine RPM", unit: "rpm", value: 1726 });
    expect(decodeFreezeValue([0x42, 0x05, 0x00, 0x7b])).toMatchObject({ value: 83 });
    expect(decodeFreezeValue([0x42, 0x0c, 0x00, 0x1a])).toBeNull(); // truncated
    expect(decodeFreezeValue([0x41, 0x0c, 0x1a, 0xf8, 0x00])).toBeNull(); // not Mode 02
  });
});

describe("scan through the simulator", () => {
  it("reads all three code modes, MIL, readiness, VIN and the freeze frame", async () => {
    const { client } = await connectSim();
    const scan = await readScan(client);
    expect(scan.errors).toEqual([]);
    expect(scan.stored).toEqual(SIM_DTCS.stored);
    expect(scan.pending).toEqual(SIM_DTCS.pending);
    expect(scan.permanent).toEqual(SIM_DTCS.permanent);
    expect(scan.status).toMatchObject({ mil: true, dtcCount: 2, ignition: "spark" });
    expect(stateOf(scan.status, "Catalyst")).toBe("complete");
    expect(stateOf(scan.thisCycle, "Evaporative system")).toBe("incomplete");
    expect(scan.vin).toBe(SIM_VIN);
    expect(scan.freezeFrame?.dtc).toBe("P0133");
    const rpm = scan.freezeFrame?.values.find((v) => v.id === "010C");
    expect(rpm?.value).toBeGreaterThan(600);
    expect(scan.freezeFrame?.values.length).toBeGreaterThanOrEqual(10);
  });

  it("blocks Mode 04 while the engine runs and never sends it", async () => {
    const { client, sent } = await connectSim();
    const outcome = await clearCodes(client);
    expect(outcome).toMatchObject({ status: "blocked", reason: "engine-running" });
    expect(outcome.status === "blocked" && outcome.reason === "engine-running" && outcome.rpm).toBeGreaterThan(0);
    expect(sent).not.toContain("04");
    expect((await readScan(client)).stored).toEqual(SIM_DTCS.stored);
  });

  it("clears at RPM 0, re-reads, and keeps the polling hold for the whole flow", async () => {
    const { sim, client } = await connectSim();
    sim.emulator.engineRunning = false;
    const holds: number[] = [];
    client.onTraffic((e) => e.dir === "tx" && holds.push(usePollingPause.getState().holds));
    const outcome = await clearCodes(client);
    expect(outcome.status).toBe("cleared");
    const after = (outcome as Extract<typeof outcome, { status: "cleared" }>).after;
    expect(after.afterClear).toBe(true);
    expect(after.stored).toEqual([]);
    expect(after.pending).toEqual([]);
    expect(after.permanent).toEqual(SIM_DTCS.permanent);
    expect(after.status).toMatchObject({ mil: false, dtcCount: 0 });
    expect(stateOf(after.status, "Catalyst")).toBe("incomplete");
    expect(after.freezeFrame).toBeNull();
    expect(Math.min(...holds)).toBeGreaterThan(0);
    expect(usePollingPause.getState().holds).toBe(0);
  });

  it("blocks when RPM can't be read", async () => {
    const sent: string[] = [];
    const client = {
      send: async (cmd: string) => {
        sent.push(cmd);
        throw new ElmError("NO_DATA", cmd);
      },
    };
    expect(await clearCodes(client)).toMatchObject({ status: "blocked", reason: "rpm-unreadable", error: "010C: NO_DATA" });
    expect(sent).toEqual(["010C"]);
  });

  it("records a failed step instead of reporting no codes", async () => {
    const { client } = await connectSim();
    const flaky = {
      send: (cmd: string, opts?: { timeoutMs?: number }) =>
        cmd === "07" ? Promise.reject(new ElmError("TIMEOUT", cmd)) : client.send(cmd, opts),
    };
    const scan = await readScan(flaky);
    expect(scan.pending).toBeNull();
    expect(scan.stored).toEqual(SIM_DTCS.stored);
    expect(scan.errors).toEqual(["Pending codes (07): 07: TIMEOUT"]);
  });
});

describe("export", () => {
  const scan: Scan = {
    at: Date.UTC(2026, 9, 16, 8, 30),
    vin: SIM_VIN,
    status: decodeMonitorStatus([0x81, 0x07, 0x01, 0x01]),
    thisCycle: null,
    stored: ["P0420"],
    pending: [],
    permanent: null,
    freezeFrame: { dtc: "P0420", values: [{ id: "0104", name: "Engine load", unit: "%", value: 23.529411 }] },
    errors: ['Permanent codes (0A): 0A: TIMEOUT, "x"'],
  };

  it("JSON carries timestamp, VIN, MIL/count, all code lists, readiness and freeze frame", () => {
    const r = JSON.parse(toJson(scan));
    expect(Object.keys(r)).toEqual(["app", "scannedAt", "afterClear", "vin", "mil", "dtcCount", "codes", "readiness", "freezeFrame", "errors"]);
    expect(r).toMatchObject({ scannedAt: "2026-10-16T08:30:00.000Z", vin: SIM_VIN, mil: true, dtcCount: 1 });
    expect(r.codes).toEqual({
      stored: [{ code: "P0420", description: "Catalyst System Efficiency Below Threshold (Bank 1)" }],
      pending: [],
      permanent: null,
    });
    expect(r.readiness.sinceClear.monitors[3]).toEqual({ name: "Catalyst", state: "incomplete" });
    expect(r.readiness.thisDriveCycle).toBeNull();
    expect(r.freezeFrame.values[0].value).toBe(23.53);
    expect(toReport(scan).errors).toHaveLength(1);
  });

  it("CSV is one section,item,value,unit table with quoted cells", () => {
    const lines = toCsv(scan).trimEnd().split("\r\n");
    expect(lines[0]).toBe("section,item,value,unit");
    expect(lines).toContain("scan,timestamp,2026-10-16T08:30:00.000Z,");
    expect(lines).toContain(`scan,vin,${SIM_VIN},`);
    expect(lines).toContain("status,mil,on,");
    expect(lines).toContain("stored,P0420,Catalyst System Efficiency Below Threshold (Bank 1),");
    expect(lines).toContain("pending,count,0,");
    expect(lines).toContain("permanent,count,read failed,");
    expect(lines).toContain("readiness_since_clear,Catalyst,incomplete,");
    expect(lines).toContain("readiness_this_drive_cycle,status,not available,");
    expect(lines).toContain("freeze_frame,Engine load,23.53,%");
    expect(lines).toContain('error,,"Permanent codes (0A): 0A: TIMEOUT, ""x""",');
    for (const l of lines.slice(1)) expect(l.split(",").length).toBeGreaterThanOrEqual(4);
  });
});

describe("scan files (folder storage contract)", () => {
  const scan: Scan = {
    at: Date.UTC(2026, 9, 16, 8, 30, 5, 250),
    vin: SIM_VIN,
    status: decodeMonitorStatus([0x82, 0x07, 0x65, 0x00]),
    thisCycle: null,
    stored: ["P0133", "P0420"],
    pending: ["P0300"],
    permanent: ["P0420"],
    freezeFrame: null,
    errors: [],
  };
  const after: Scan = { ...scan, at: scan.at + 4000, stored: [], pending: [], afterClear: true };

  it("names files scans/<YYYY-MM-DDTHH-mm-ssZ>_<VIN or NOVIN>.json", () => {
    expect(scanFileName(scan.at, SIM_VIN)).toBe("2026-10-16T08-30-05Z_SIMULATOR0VIN0001.json");
    expect(scanFileName(scan.at, null)).toBe("2026-10-16T08-30-05Z_NOVIN.json");
    expect(scanFileName(scan.at, "../AB C")).toBe("2026-10-16T08-30-05Z_ABC.json");
  });

  it("starts every file with format, version, takenAt, vin, kind", () => {
    const read = JSON.parse(JSON.stringify(readFile(scan)));
    expect(Object.keys(read).slice(0, 5)).toEqual(["format", "version", "takenAt", "vin", "kind"]);
    expect(read).toMatchObject({ format: "obd-dash-scan", version: 1, takenAt: "2026-10-16T08:30:05.250Z", vin: SIM_VIN, kind: "read" });
    const clear = JSON.parse(JSON.stringify(clearFile(scan, after)));
    expect(Object.keys(clear).slice(0, 5)).toEqual(["format", "version", "takenAt", "vin", "kind"]);
    expect(clear).toMatchObject({ kind: "clear", takenAt: "2026-10-16T08:30:09.250Z" });
    expect(clear.before.stored).toEqual(["P0133", "P0420"]);
    expect(clear.after.stored).toEqual([]);
  });

  it("round-trips through parseScanFile and rejects files that aren't ours", () => {
    expect(parseScanFile(JSON.stringify(readFile(scan)))).toEqual(readFile(scan));
    expect(parseScanFile(JSON.stringify(clearFile(scan, after)))).toEqual(clearFile(scan, after));
    expect(() => parseScanFile("nope")).toThrow("not valid JSON");
    expect(() => parseScanFile("null")).toThrow("not an OBD Dash scan file");
    expect(() => parseScanFile(JSON.stringify({ ...readFile(scan), version: 2 }))).toThrow("version 2");
    const damaged = { ...readFile(scan), scan: { ...scan, stored: "P0133" } };
    expect(() => parseScanFile(JSON.stringify(damaged))).toThrow("damaged");
    expect(() => parseScanFile(JSON.stringify({ ...clearFile(scan, after), after: null }))).toThrow("damaged");
  });
});
