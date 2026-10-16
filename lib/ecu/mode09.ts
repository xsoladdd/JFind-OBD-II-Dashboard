import { ElmError } from "../elm/ElmClient";
import { parseMessages } from "../obd/parse";
import { hex2, parseBitmask } from "../obd/supported";

type Sender = { send: (cmd: string, opts?: { timeoutMs?: number }) => Promise<string[]> };

/**
 * Data bytes of a Mode 09 reply, after "49 <pid> <n>". CAN sends one ISO-TP message whose third byte is the item
 * count; legacy protocols send one line per message with the message number in that byte (same rule as parseVin).
 */
export function mode09Data(lines: string[], pid: number): number[] {
  const msgs = parseMessages(lines).filter((m) => m[0] === 0x49 && m[1] === pid);
  if (msgs.length === 1) return msgs[0]!.slice(3);
  return msgs.sort((a, b) => (a[2] ?? 0) - (b[2] ?? 0)).flatMap((m) => m.slice(3));
}

const chunks = (b: number[], n: number) => Array.from({ length: Math.floor(b.length / n) }, (_, i) => b.slice(i * n, i * n + n));
const ascii = (b: number[]) => String.fromCharCode(...b.filter((c) => c >= 0x20 && c < 0x7f)).trim();

/** 0904: one 16-byte ASCII calibration ID per item, null-padded. */
export const parseCalIds = (lines: string[]) => chunks(mode09Data(lines, 0x04), 16).map(ascii).filter(Boolean);
/** 0906: one 4-byte calibration verification number per item, shown as hex. */
export const parseCvns = (lines: string[]) => chunks(mode09Data(lines, 0x06), 4).map((c) => c.map(hex2).join(""));
/** 090A: 20 ASCII bytes, null-padded (e.g. "ECM\0-EngineControl" → "ECM-EngineControl"). */
export const parseEcuName = (lines: string[]) => ascii(mode09Data(lines, 0x0a));

/** 0908 counter order (spark ignition), cross-checked against a public reproduction of SAE J1979. [verify] */
const IPT_SPARK = [
  "OBDCOND", "IGNCNTR", "CATCOMP1", "CATCOND1", "CATCOMP2", "CATCOND2", "O2SCOMP1", "O2SCOND1", "O2SCOMP2", "O2SCOND2",
  "EGRCOMP", "EGRCOND", "AIRCOMP", "AIRCOND", "EVAPCOMP", "EVAPCOND", "SO2SCOMP1", "SO2SCOND1", "SO2SCOMP2", "SO2SCOND2",
];

export interface IptCounter {
  name: string;
  value: number;
}

/** 0908 / 090B: 16-bit counters. 090B (compression ignition) names aren't confirmed, so they show as "Counter N". */
export function parseIpt(lines: string[], pid: 0x08 | 0x0b): IptCounter[] {
  return chunks(mode09Data(lines, pid), 2).map(([a, b], i) => ({
    name: (pid === 0x08 && IPT_SPARK[i]) || `Counter ${i + 1}`,
    value: (a! << 8) | b!,
  }));
}

export interface VehicleInfo {
  supported: number[];
  calIds: string[];
  cvns: string[];
  ecuName: string;
  ipt: { pid: 0x08 | 0x0b; counters: IptCounter[] } | null;
}

async function query(client: Sender, cmd: string): Promise<string[] | null> {
  try {
    return await client.send(cmd, { timeoutMs: 5000 });
  } catch (e) {
    if (e instanceof ElmError && e.code === "NO_DATA") return null;
    throw e;
  }
}

/** 0900 bitmask, then 0904/0906/090A and 0908 or 090B, each only when the car lists it. */
export async function readVehicleInfo(client: Sender): Promise<VehicleInfo> {
  const mask = parseMessages((await query(client, "0900")) ?? []).find((m) => m[0] === 0x49 && m[1] === 0x00);
  const supported = mask ? parseBitmask(0, mask.slice(2, 6)).map((id) => parseInt(id.slice(2), 16)) : [];
  const read = async (pid: number) => (supported.includes(pid) ? query(client, `09${hex2(pid)}`) : null);
  const info: VehicleInfo = { supported, calIds: [], cvns: [], ecuName: "", ipt: null };
  const cal = await read(0x04);
  if (cal) info.calIds = parseCalIds(cal);
  const cvn = await read(0x06);
  if (cvn) info.cvns = parseCvns(cvn);
  const name = await read(0x0a);
  if (name) info.ecuName = parseEcuName(name);
  for (const pid of [0x08, 0x0b] as const) {
    const lines = await read(pid);
    if (lines) {
      info.ipt = { pid, counters: parseIpt(lines, pid) };
      break;
    }
  }
  return info;
}
