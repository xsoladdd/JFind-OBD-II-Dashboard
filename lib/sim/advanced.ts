/**
 * Simulator extensions for /ecu (advanced diagnostics): Mode 06 tests, extra Mode 09 PIDs, ATH1 header mode with a
 * second ECU (7E9 transmission), and a battery voltage model for the cranking test. Hooked into elm327.ts in a few lines.
 * All values are made up for the demo; they are not real-car data.
 */
import { encodeDtc } from "../obd/dtc";
import { hex2 } from "../obd/supported";
import { bitmask } from "./elm327";

export const SIM_TCM_DTCS = ["P0700"];
export const SIM_CALID = "SIMCAL-ECM-00001";
export const SIM_CVN = "1A2B3C4D";

// [MID, TID, UASID, value, min, max] as raw 16-bit fields. MID 21 TID 80 fails; UASID 0x3F is not in our table.
export const SIM_MODE06: [number, number, number, number, number, number][] = [
  [0x01, 0x81, 0x0b, 720, 600, 1100], // 0.720 V within 0.600–1.100 V
  [0x01, 0x82, 0x10, 85, 0, 150], // 85 ms
  [0x21, 0x80, 0x20, 0xd0, 0x00, 0xa0], // ratio 0.8125 > max 0.625: FAIL (fits the sim's P0420)
  [0x21, 0x81, 0x3f, 0x0140, 0x0000, 0x0200], // unknown UASID: shown raw
  [0xa2, 0x0b, 0x24, 3, 0, 30], // 3 counts
  [0xa2, 0x0c, 0x24, 0, 0, 30],
];
const MIDS = [...new Set(SIM_MODE06.map((t) => t[0]))];
const word = (n: number) => [n >> 8, n & 0xff];
const ascii = (s: string, len: number) => [...s.padEnd(len, "\0")].slice(0, len).map((c) => c.charCodeAt(0));
// Spark-ignition IPT counters: OBDCOND, IGNCNTR, then COMP/COND pairs (CAT1, CAT2, O2S1, O2S2, EGR, AIR, EVAP).
const IPT = [120, 340, 95, 120, 0, 0, 101, 120, 0, 0, 88, 120, 0, 0, 64, 120];

/** Engine ECU (7E8) Mode 06 reply. Range MIDs (00, 20, …) answer while a higher MID exists. */
export function mode06Reply(mid: number | undefined): number[] | null {
  if (mid === undefined) return null;
  if (mid % 0x20 === 0) return MIDS.some((m) => m > mid) ? [0x46, mid, ...bitmask(mid, MIDS)] : null;
  const tests = SIM_MODE06.filter((t) => t[0] === mid);
  return tests.length ? [0x46, ...tests.flatMap(([m, t, u, v, lo, hi]) => [m, t, u, ...word(v), ...word(lo), ...word(hi)])] : null;
}

/** Engine ECU Mode 09 PIDs other than the VIN (0902, still in elm327.ts). */
export function mode09Reply(pid: number | undefined): number[] | null {
  switch (pid) {
    case 0x00:
      return [0x49, 0x00, ...bitmask(0, [0x02, 0x04, 0x06, 0x08, 0x0a])];
    case 0x04:
      return [0x49, 0x04, 0x01, ...ascii(SIM_CALID, 16)];
    case 0x06:
      return [0x49, 0x06, 0x01, ...SIM_CVN.match(/../g)!.map((h) => parseInt(h, 16))];
    case 0x08:
      return [0x49, 0x08, IPT.length, ...IPT.flatMap(word)];
    case 0x0a:
      return [0x49, 0x0a, 0x01, ...ascii("ECM\0-EngineControl", 20)];
    default:
      return null;
  }
}

/** The transmission ECU answers only in header mode, so ATH0 reads (and their tests) still see one ECU. */
function tcmReply([mode, pid]: number[]): number[] | null {
  if (mode === 0x03) return [0x43, SIM_TCM_DTCS.length, ...SIM_TCM_DTCS.flatMap(encodeDtc)];
  if (mode === 0x07) return [0x47, 0x00];
  if (mode === 0x0a) return [0x4a, 0x00];
  if (mode === 0x09 && pid === 0x0a) return [0x49, 0x0a, 0x01, ...ascii("TCM\0-TransmissionCtl", 20)];
  return null;
}

/** CAN frames with the ISO-TP PCI byte, padded to 8 bytes. */
function isoTp(p: number[]): number[][] {
  const pad = (f: number[]) => [...f, ...Array<number>(8 - f.length).fill(0)];
  if (p.length <= 7) return [pad([p.length, ...p])];
  const frames = [[0x10 | (p.length >> 8), p.length & 0xff, ...p.slice(0, 6)]];
  for (let i = 6, n = 1; i < p.length; i += 7, n++) frames.push(pad([0x20 | (n & 0xf), ...p.slice(i, i + 7)]));
  return frames;
}

/** ATH1 reply lines: "7E8 06 41 00 …" for the engine ECU, then the transmission ECU if it answers. */
export function headerLines(request: number[], engine: number[] | null, spaces: boolean): string[] {
  const out: string[] = [];
  for (const [id, payload] of [["7E8", engine], ["7E9", tcmReply(request)]] as const) {
    for (const f of payload ? isoTp(payload) : []) out.push([id, ...f.map(hex2)].join(spaces ? " " : ""));
  }
  return out;
}

export type SimBattery = { state: "off" | "cranking" | "running"; since: number };

/** Battery voltage: resting with the engine off; a crank dips, recovers, then the alternator takes over. */
export function batteryVolts(b: SimBattery, now = Date.now()): number {
  if (b.state === "off") return 12.5;
  if (b.state === "running") return 14.1;
  const t = (now - b.since) / 1000;
  if (t < 0.4) return 10.2;
  if (t < 1.5) return 11.2;
  return t < 2 ? 12.2 : 14.1;
}
