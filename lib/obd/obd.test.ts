import { describe, expect, it } from "vitest";
import { decodeDtc, describeDtc, encodeDtc } from "./dtc";
import { parseDtcResponse, parseMessages, parseVin } from "./parse";
import { PIDS } from "./pids";
import { parseBitmask } from "./supported";

describe("PID decoders", () => {
  it.each([
    ["0104", [0xff], 100],
    ["0105", [0x7b], 83],
    ["0106", [0x80], 0],
    ["0107", [0x00], -100],
    ["010A", [0x50], 240],
    ["010B", [0x21], 33],
    ["010C", [0x1a, 0xf8], 1726],
    ["010D", [0x32], 50],
    ["010E", [0x80], 0],
    ["010F", [0x28], 0],
    ["0110", [0x01, 0x2c], 3],
    ["0111", [0x00], 0],
    ["011F", [0x01, 0x00], 256],
    ["012F", [0x80], (128 * 100) / 255],
    ["0133", [0x65], 101],
    ["0142", [0x37, 0x14], 14.1],
    ["0146", [0x39], 17],
    ["015C", [0x82], 90],
    ["015E", [0x00, 0x14], 1],
  ])("%s %j → %d", (id, bytes, value) => {
    expect(PIDS[id]!.decode(bytes)).toBeCloseTo(value, 5);
  });

  it("covers every PID in the spec", () => {
    expect(Object.keys(PIDS)).toHaveLength(19);
  });
});

describe("supported PID bitmask", () => {
  it("decodes 41 00 BE 1F A8 13 (classic example)", () => {
    expect(parseBitmask(0x00, [0xbe, 0x1f, 0xa8, 0x13])).toEqual([
      "0101", "0103", "0104", "0105", "0106", "0107", "010C", "010D", "010E", "010F",
      "0110", "0111", "0113", "0115", "011C", "011F", "0120",
    ]);
  });
  it("offsets by the range base", () => {
    expect(parseBitmask(0x40, [0x80, 0, 0, 0x01])).toEqual(["0141", "0160"]);
  });
});

describe("DTC decoder", () => {
  it.each([
    [0x01, 0x33, "P0133"],
    [0x04, 0x20, "P0420"],
    [0x41, 0x23, "C0123"],
    [0x92, 0x34, "B1234"],
    [0xc1, 0x00, "U0100"],
    [0xff, 0xff, "U3FFF"],
  ])("%d %d → %s", (a, b, code) => {
    expect(decodeDtc(a, b)).toBe(code);
    expect(encodeDtc(code)).toEqual([a, b]);
  });
  it("drops 0000 padding", () => {
    expect(decodeDtc(0, 0)).toBeNull();
  });
  it("never invents a description", () => {
    expect(describeDtc("P1133")).toBe("Manufacturer-specific / unknown");
  });
});

describe("response parsing", () => {
  it("parses CAN DTC replies with a count byte", () => {
    expect(parseDtcResponse(["43 02 01 33 04 20"], "03")).toEqual(["P0133", "P0420"]);
    expect(parseDtcResponse(["4300"], "03")).toEqual([]);
  });
  it("parses legacy DTC replies with 0000 padding, several lines", () => {
    expect(parseDtcResponse(["43 01 33 04 20 01 71", "43 03 00 00 00 00 00"], "03")).toEqual(["P0133", "P0420", "P0171", "P0300"]);
  });
  it("parses multi-frame CAN DTC replies and ignores other modes", () => {
    const lines = ["00A", "0:43040133042001", "1:7103000000"];
    expect(parseDtcResponse(lines, "03")).toEqual(["P0133", "P0420", "P0171", "P0300"]);
    expect(parseDtcResponse(lines, "07")).toEqual([]);
  });
  it("joins ISO-TP frames and trims to the byte count", () => {
    expect(parseMessages(["005", "0: 49 02 01 41 42 00", "1: 00 00"])).toEqual([[0x49, 0x02, 0x01, 0x41, 0x42]]);
  });
  it("parses a CAN multi-frame VIN", () => {
    const lines = ["014", "0: 49 02 01 31 44 34", "1: 47 50 30 30 52 35 35", "2: 42 31 32 33 34 35 36"];
    expect(parseVin(lines)).toBe("1D4GP00R55B123456");
  });
  it("parses a legacy five-line VIN", () => {
    const lines = [
      "49 02 01 00 00 00 31",
      "49 02 02 44 34 47 50",
      "49 02 03 30 30 52 35",
      "49 02 04 35 42 31 32",
      "49 02 05 33 34 35 36",
    ];
    expect(parseVin(lines)).toBe("1D4GP00R55B123456");
  });
  it("throws on non-hex junk", () => {
    expect(() => parseMessages(["41 0C ZZ"])).toThrow();
  });
});
