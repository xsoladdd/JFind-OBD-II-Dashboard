import { afterAll, describe, expect, it } from "vitest";
import { parseScanFile } from "../diagnostics/scanFile";
import { SIM_DTCS } from "../sim/elm327";
import { readText, useFolder } from "../storage/folder";
import { SimulatorTransport } from "../transport/SimulatorTransport";
import { getClient, useConnection } from "./connection";
import { useDiagnostics } from "./diagnostics";

const d = () => useDiagnostics.getState();
const NAME = /^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\dZ_SIMULATOR0VIN0001\.json$/;

describe("diagnostics store + folder storage", () => {
  afterAll(() => useConnection.getState().disconnect());

  it("saves one file per read and per clear run, lists them, and opens them by name", async () => {
    await useFolder.getState().link();
    await useConnection.getState().connect("demo");
    (getClient()!.transport as SimulatorTransport).emulator.engineRunning = false;

    await d().read();
    const readName = d().savedAs;
    expect(readName).toMatch(NAME);
    expect(parseScanFile((await readText(`scans/${readName}`))!)).toMatchObject({ kind: "read", scan: { stored: SIM_DTCS.stored } });

    await d().clear();
    const clearName = d().savedAs;
    expect(clearName).toMatch(NAME);
    expect(clearName).not.toBe(readName);
    const clear = parseScanFile((await readText(`scans/${clearName}`))!);
    expect(clear).toMatchObject({
      kind: "clear",
      before: { stored: SIM_DTCS.stored, pending: SIM_DTCS.pending },
      after: { stored: [], pending: [], permanent: SIM_DTCS.permanent },
    });
    expect(d().recent.map((f) => f.name)).toEqual([clearName, readName]);

    await d().openFile(clearName);
    expect(d().viewing).toMatchObject({ name: clearName, file: { kind: "clear" } });
    await d().openFile(null);
    expect(d().viewing).toBeNull();
  }, 30000);

  it("only opens bare file names from the scans folder", async () => {
    await d().openFile("../secrets.json");
    expect(d().viewError).toMatch(/isn't a scan file name/);
    await d().openFile("2000-01-01T00-00-00Z_NOVIN.json");
    expect(d().viewError).toMatch(/isn't in the scans folder/);
  });

  it("skips saving without a ready folder but still reads", async () => {
    await useFolder.getState().unlink();
    await d().read();
    expect(d().live?.stored).toEqual([]);
    expect(d().savedAs).toBe("");
    expect(d().saveError).toBe("");
    await d().openFile("2000-01-01T00-00-00Z_NOVIN.json");
    expect(d().viewError).toBe("Choose a folder (History page) to open saved scans.");
  }, 30000);
});
