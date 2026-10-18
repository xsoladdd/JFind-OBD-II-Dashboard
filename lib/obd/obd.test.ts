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
    // Added in JOID-0010. Vectors worked from the J1979 formulas (Wikipedia "OBD-II PIDs" reproduction).
    ["0103", [0x02, 0x00], 512],
    ["0108", [0x90], 12.5],
    ["0109", [0x70], -12.5],
    ["0113", [0x33], 0x33],
    ...[0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b].flatMap((pid): [string, number[], number][] => {
      const id = `01${pid.toString(16).toUpperCase()}`;
      return [[id, [0x5a, 0x80], 0.45], [`${id}T`, [0x5a, 0x88], 6.25]];
    }),
    ["011C", [0x06], 6],
    ["011D", [0x05], 5],
    ["0121", [0x01, 0x02], 258],
    ["012C", [0x33], 20],
    ["012D", [0x40], -50],
    ["012E", [0xff], 100],
    ["0130", [0x0c], 12],
    ["0131", [0x07, 0x30], 1840],
    ["0143", [0x01, 0x00], (256 * 100) / 255],
    ["0144", [0x80, 0x00], 1],
    ["0145", [0x66], 40],
    ["0147", [0x33], 20],
    ["0148", [0x66], 40],
    ["0149", [0x99], 60],
    ["014A", [0xcc], 80],
    ["014B", [0xff], 100],
    ["014C", [0x00], 0],
    ["014D", [0x00, 0x3c], 60],
    ["014E", [0x0a, 0x5a], 2650],
    ["0151", [0x04], 4],
    ["0152", [0x0d], (13 * 100) / 255],
    ["0159", [0x01, 0xf4], 5000],
    ["015A", [0x80], (128 * 100) / 255],
    ["0161", [0x7d], 0],
    ["0162", [0xff], 130],
    ["0163", [0x01, 0x40], 320],
    ["01A4", [0x03, 0x31, 0x05, 0xdc], 3], // 3rd gear (ratio 1.5)
    ["01A4", [0x01, 0x01, 0x00, 0x00], 0], // neutral
  ])("%s %j → %d", (id, bytes, value) => {
    expect(PIDS[id]!.decode(bytes)).toBeCloseTo(value, 5);
  });

  it("covers every PID in the spec", () => {
    expect(Object.keys(PIDS)).toHaveLength(66);
  });

  it("reads no gear from 01A4 when its gear bit isn't set, and shows neutral as N", () => {
    expect(PIDS["01A4"]!.decode([0x02, 0x30, 0x05, 0xdc])).toBeNaN();
    expect([0, 3, NaN].map(PIDS["01A4"]!.text!)).toEqual(["N", "3", "--"]);
  });

  it("renders enum and bit-status PIDs as text", () => {
    expect(PIDS["0103"]!.text!(0x0200)).toBe("1: Closed loop · 2: —");
    expect(PIDS["0103"]!.text!(0x0110)).toBe("1: Open loop (engine cold) · 2: Closed loop (O2 sensor fault)");
    expect(PIDS["0113"]!.text!(0x33)).toBe("B1S1 B1S2 B2S1 B2S2");
    expect(PIDS["011D"]!.text!(0x05)).toBe("B1S1 B2S1");
    expect(PIDS["0113"]!.text!(0)).toBe("None");
    expect(PIDS["011C"]!.text!(6)).toBe("EOBD (Europe)");
    expect(PIDS["011C"]!.text!(30)).toBe("Code 30");
    expect(PIDS["0151"]!.text!(4)).toBe("Diesel");
    expect(PIDS["0151"]!.text!(23)).toBe("Bifuel: diesel");
  });

  it("two-value PIDs share one command and one reply", () => {
    expect(PIDS["0114T"]!.cmd).toBe("0114");
    expect(PIDS["0114"]!.cmd).toBeUndefined();
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
