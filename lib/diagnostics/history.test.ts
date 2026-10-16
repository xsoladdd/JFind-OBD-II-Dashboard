import { afterEach, describe, expect, it, vi } from "vitest";
import { ElmClient } from "../elm/ElmClient";
import { describeDtc } from "../obd/dtc";
import { FakeDir } from "../storage/fakeFs";
import { SIM_VIN } from "../sim/elm327";
import { SimulatorTransport } from "../transport/SimulatorTransport";
import { buildHistory, historyCsv } from "./history";
import { clearCodes, readScan, type Scan } from "./scan";
import { clearFile, readFile, scanFileName, type ScanFile } from "./scanFile";

const VIN = "WVWZZZ1KZAW000001";
const T0 = Date.UTC(2026, 9, 1, 8, 0, 0);
const MIN = 60_000;

const scan = (min: number, over: Partial<Scan> = {}, vin: string | null = VIN): Scan => ({
  at: T0 + min * MIN,
  vin,
  status: null,
  thisCycle: null,
  stored: [],
  pending: [],
  permanent: [],
  freezeFrame: null,
  errors: [],
  ...over,
});
const named = (f: ScanFile) => ({ name: scanFileName(Date.parse(f.takenAt), f.vin), file: f });
const read = (min: number, over: Partial<Scan> = {}, vin: string | null = VIN) => named(readFile(scan(min, over, vin)));

// pending → stored → stored+permanent → cleared → back as pending → gone
const t3 = scan(30, { stored: ["P0300", "P0420"], permanent: ["P0420"] });
const series = [
  read(0, { pending: ["P0300"] }),
  read(10, { stored: ["P0300"] }),
  named(readFile(t3)),
  named(clearFile(t3, { ...scan(40, { permanent: ["P0420"] }), afterClear: true })),
  read(1000, { pending: ["P0300"], permanent: ["P0420"] }),
  read(2000, { permanent: ["P0420"] }),
];

const code = (files: ReturnType<typeof read>[], c: string, vin: string | null = VIN) =>
  buildHistory(files).cars.find((x) => x.vin === vin)!.codes.find((x) => x.code === c)!;

describe("timeline", () => {
  const p0300 = code(series, "P0300");

  it("first / last seen, scans it was in, and the lists over time", () => {
    expect(p0300.firstSeen).toBe(T0);
    expect(p0300.lastSeen).toBe(T0 + 1000 * MIN);
    expect(p0300.timesSeen).toBe(4); // the clear file's "before" is the same scan as the read file: counted once
    expect(p0300.path).toEqual(["pending", "stored", "pending"]);
  });

  it("records the clear and that the code came back, and how long after", () => {
    expect(p0300.clearedCount).toBe(1);
    expect(p0300.events.map((e) => e.kind)).toEqual(["seen", "seen", "seen", "cleared", "seen"]);
    expect(p0300.cameBack).toMatchObject({ afterMs: 960 * MIN, at: T0 + 1000 * MIN });
  });

  it("says gone, since the first full scan without it", () => {
    expect(p0300.status).toBe("gone");
    expect(p0300.goneSince).toBe(T0 + 2000 * MIN);
  });

  it("a code that only stays permanent after a clear has not come back", () => {
    const p0420 = code(series, "P0420");
    expect(p0420.path).toEqual(["stored+permanent", "permanent"]);
    expect(p0420.cameBack).toBeNull();
    expect(p0420.status).toBe("permanent");
    expect(p0420.goneSince).toBeNull();
  });

  it("current status follows the latest scan: stored = active, pending = pending", () => {
    expect(code([read(0, { stored: ["P0133"] })], "P0133").status).toBe("active");
    expect(code([read(0, { stored: ["P0133"] }), read(5, { pending: ["P0133"] })], "P0133").status).toBe("pending");
  });

  it("a failed list read is not 'gone'", () => {
    const files = [read(0, { stored: ["P0133"] }), read(5, { stored: [], pending: null })];
    expect(code(files, "P0133").status).toBe("unknown");
    // ...and the first complete scan afterwards decides
    expect(code([...files, read(9)], "P0133")).toMatchObject({ status: "gone", goneSince: T0 + 9 * MIN });
  });

  it("a clear that didn't remove the code is not a clear for it", () => {
    const before = scan(0, { stored: ["P0133"] });
    const files = [named(clearFile(before, { ...scan(1, { stored: ["P0133"] }), afterClear: true }))];
    expect(code(files, "P0133").clearedCount).toBe(0);
  });

  it("orders unfinished business first: current codes before gone ones", () => {
    const codes = buildHistory(series).cars[0]!.codes.map((c) => c.code);
    expect(codes).toEqual(["P0420", "P0300"]);
  });
});

describe("grouping by VIN", () => {
  it("keeps each car's codes apart, with 'no VIN' as its own group", () => {
    const files = [
      read(0, { stored: ["P0300"] }),
      read(1, { stored: ["P0171"] }, "OTHERVIN"),
      read(2, { stored: ["P0300"] }, null),
    ];
    const { cars } = buildHistory(files);
    expect(cars.map((c) => c.vin).sort()).toEqual([null, "OTHERVIN", VIN].sort());
    expect(cars.find((c) => c.vin === "OTHERVIN")!.codes.map((c) => c.code)).toEqual(["P0171"]);
    expect(code(files, "P0300", null).timesSeen).toBe(1);
    expect(code(files, "P0300").timesSeen).toBe(1);
  });
});

describe("CSV", () => {
  it("has a header and one row per code, with quoting", () => {
    const rows = buildHistory(series).cars[0]!.codes.map((h) => ({ car: 'My "Golf", 2.0', h }));
    const lines = historyCsv(rows).split("\r\n");
    expect(lines[0]).toBe(
      "car,vin,code,description,first_seen,last_seen,times_seen,lists_over_time,times_cleared,came_back_after_clear,came_back_after_s,status,gone_since",
    );
    expect(lines).toHaveLength(4); // header, two codes, trailing newline
    expect(lines[2]).toBe(
      `"My ""Golf"", 2.0",${VIN},P0300,${describeDtc("P0300")},2026-10-01T08:00:00.000Z,2026-10-02T00:40:00.000Z,4,pending > stored > pending,1,yes,57600,gone,2026-10-02T17:20:00.000Z`,
    );
  });
});

describe("from the simulator: read → clear → read", () => {
  it("shows the demo code coming back", async () => {
    const sim = new SimulatorTransport({ chunkSize: [1, 20], delayMs: 0, seed: 42 });
    const client = new ElmClient(sim, { reconnectDelayMs: 1 });
    await client.connect();
    sim.emulator.engineRunning = false;
    const at = (s: Scan, min: number): Scan => ({ ...s, at: T0 + min * MIN });
    const first = at(await readScan(client), 0);
    const outcome = await clearCodes(client);
    if (outcome.status !== "cleared") throw new Error("clear blocked");
    const after = at(outcome.after, 5);
    const second = at(await readScan(client), 60);
    const files = [named(readFile(first)), named(clearFile(first, after)), named(readFile(second))];
    const p0133 = code(files, "P0133", SIM_VIN);
    expect(p0133.cameBack).toMatchObject({ afterMs: 55 * MIN });
    expect(p0133.status).toBe("pending");
    expect(code(files, "P0300", SIM_VIN).status).toBe("gone");
  });
});

describe("loading scans/ from the folder", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function boot(root: FakeDir) {
    vi.resetModules();
    vi.stubGlobal("showDirectoryPicker", async () => root);
    const folder = await import("../storage/folder");
    await folder.initFolder();
    await folder.useFolder.getState().link();
    return import("./history");
  }

  it("skips and counts damaged, foreign and wrong-version files", async () => {
    const good = read(0, { stored: ["P0300"] });
    const root = new FakeDir("OBD Dash")
      .seed(`scans/${good.name}`, JSON.stringify(good.file))
      .seed("scans/2026-10-01T09-00-00Z_NOVIN.json", "not json")
      .seed("scans/foreign.json", JSON.stringify({ hello: "world" }))
      .seed("scans/2026-10-01T10-00-00Z_NOVIN.json", JSON.stringify({ ...good.file, version: 2 }))
      .seed("scans/damaged.json", JSON.stringify({ ...good.file, scan: { ...good.file, stored: "P0133" } }));
    const h = await boot(root);
    const { files, skipped } = await h.loadScanFiles();
    expect(files.map((f) => f.name)).toEqual([good.name]);
    expect(skipped).toBe(4);
  });

  it("is empty, not an error, before any scan was saved", async () => {
    const h = await boot(new FakeDir("OBD Dash"));
    expect(await h.loadScanFiles()).toEqual({ files: [], skipped: 0 });
  });

  it("re-reads a file only when its size or lastModified changed", async () => {
    const good = read(0, { stored: ["P0300"] });
    const text = JSON.stringify(good.file);
    const root = new FakeDir("OBD Dash").seed(`scans/${good.name}`, text);
    const h = await boot(root);
    expect((await h.loadScanFiles()).skipped).toBe(0);

    const f = root.file(`scans/${good.name}`)!;
    f.data = text.replace("obd-dash-scan", "obd-dash-scxx"); // same size and lastModified: served from the cache
    expect((await h.loadScanFiles()).skipped).toBe(0);

    f.lastModified += 1;
    expect(await h.loadScanFiles()).toMatchObject({ files: [], skipped: 1 });
  });

  it("handles a few hundred files", async () => {
    const root = new FakeDir("OBD Dash");
    for (let i = 0; i < 300; i++) {
      const f = read(i, { stored: i % 2 ? ["P0300"] : [] });
      root.seed(`scans/${f.name}`, JSON.stringify(f.file));
    }
    const h = await boot(root);
    const { files, skipped } = await h.loadScanFiles();
    expect({ n: files.length, skipped }).toEqual({ n: 300, skipped: 0 });
    expect(buildHistory(files).cars[0]!.codes[0]!.timesSeen).toBe(150);
  });
});
