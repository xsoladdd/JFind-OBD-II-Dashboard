import { describe, expect, it } from "vitest";
import type { ElmErrorCode } from "../elm/ElmClient";
import { countDrops, pickStep, STEPS, type PickInput } from "./troubleshoot";

const base: PickInput = { hasBluetooth: true, mode: "ble", status: "idle", failure: null, vehicleError: null, elmVersion: "", log: [] };
const fail = (name: string, afterTransport: boolean, code?: ElmErrorCode) => ({ ...base, status: "error" as const, failure: { name, afterTransport, code } });
const drop = { dir: "error", text: "link dropped" };

describe("pickStep", () => {
  it("no Web Bluetooth, except in Demo mode", () => {
    expect(pickStep({ ...base, hasBluetooth: false })).toBe("no-bluetooth");
    expect(pickStep({ ...base, hasBluetooth: false, mode: "demo", status: "connected", elmVersion: "ELM327 v1.5" })).toBeNull();
  });

  it("chooser cancelled or no device found (NotFoundError before the link is up)", () => {
    expect(pickStep(fail("NotFoundError", false))).toBe("chooser");
  });

  it("GATT connect failed (any other error before the link is up)", () => {
    expect(pickStep(fail("NetworkError", false))).toBe("gatt");
    expect(pickStep(fail("Error", false))).toBe("gatt");
  });

  it("no notify/write characteristic found", () => {
    expect(pickStep(fail("NoCharacteristicError", false))).toBe("characteristics");
  });

  it("ATZ timeout or any other init failure after the link is up", () => {
    expect(pickStep(fail("ElmError", true, "TIMEOUT"))).toBe("init");
    expect(pickStep(fail("ElmError", true, "ADAPTER_ERROR"))).toBe("init");
  });

  it("garbage instead of a version string after connecting", () => {
    expect(pickStep({ ...base, status: "connected", elmVersion: "xq 9#" })).toBe("init");
    expect(pickStep({ ...base, status: "connected", elmVersion: "ELM327 v2.1" })).toBeNull();
    expect(pickStep({ ...base, status: "connected", elmVersion: "v1.5" })).toBeNull();
  });

  it.each<ElmErrorCode>(["UNABLE_TO_CONNECT", "NO_DATA", "BUS_INIT", "CAN_ERROR"])("%s means check the ignition and protocol", (vehicleError) => {
    expect(pickStep({ ...base, status: "connected", elmVersion: "ELM327 v1.5", vehicleError })).toBe("vehicle");
  });

  it("a timeout on the first 0100 points at the adapter, not the car", () => {
    expect(pickStep({ ...base, status: "connected", elmVersion: "ELM327 v1.5", vehicleError: "TIMEOUT" })).toBe("init");
  });

  it("the link dropping during init, or twice since connecting", () => {
    expect(pickStep(fail("ElmError", true, "DISCONNECTED"))).toBe("disconnects");
    const log = [{ dir: "info", text: "transport connected" }, drop, drop];
    expect(pickStep({ ...base, status: "connected", elmVersion: "ELM327 v1.5", log })).toBe("disconnects");
  });

  it("one drop is not enough, and drops from an earlier connection don't count", () => {
    expect(pickStep({ ...base, status: "connected", elmVersion: "ELM327 v1.5", log: [drop] })).toBeNull();
    expect(countDrops([drop, drop, drop, { dir: "info", text: "transport connected" }, drop])).toBe(1);
  });

  it("nothing wrong, nothing to show", () => {
    expect(pickStep(base)).toBeNull();
  });
});

describe("guide content", () => {
  it("has one non-empty step for every id pickStep can return", () => {
    expect(STEPS.map((s) => s.id).sort()).toEqual(["characteristics", "chooser", "disconnects", "gatt", "init", "no-bluetooth", "vehicle"]);
    for (const s of STEPS) expect(s.items.length).toBeGreaterThan(2);
  });

  it("points the UUID and write-characteristic steps at the UUID settings and the debug console", () => {
    expect(STEPS.find((s) => s.id === "characteristics")?.links).toEqual(["console", "uuids"]);
    expect(STEPS.find((s) => s.id === "init")?.links).toContain("uuids");
  });
});
