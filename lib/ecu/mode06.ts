import { ElmError } from "../elm/ElmClient";
import { parseMessages } from "../obd/parse";
import { hex2, parseBitmask } from "../obd/supported";

type Sender = { send: (cmd: string, opts?: { timeoutMs?: number }) => Promise<string[]> };

/**
 * Unit and Scaling IDs (SAE J1979 / ISO 15031-5 Appendix E), only the entries cross-checked against a public
 * reproduction of the table. [verify] against the standard itself. Anything missing is shown raw.
 */
const UAS: Record<number, { scale: number; unit: string; offset?: number }> = {
  0x01: { scale: 1, unit: "" },
  0x02: { scale: 0.1, unit: "" },
  0x03: { scale: 0.01, unit: "" },
  0x04: { scale: 0.001, unit: "" },
  0x05: { scale: 0.0000305, unit: "" },
  0x06: { scale: 0.000305, unit: "" },
  0x07: { scale: 0.25, unit: "rpm" },
  0x08: { scale: 0.01, unit: "km/h" },
  0x09: { scale: 1, unit: "km/h" },
  0x0a: { scale: 0.122, unit: "mV" },
  0x0b: { scale: 0.001, unit: "V" },
  0x0c: { scale: 0.01, unit: "V" },
  0x0d: { scale: 0.00390625, unit: "mA" },
  0x0e: { scale: 0.001, unit: "A" },
  0x0f: { scale: 0.01, unit: "A" },
  0x10: { scale: 1, unit: "ms" },
  0x11: { scale: 100, unit: "ms" },
  0x12: { scale: 1, unit: "s" },
  0x13: { scale: 1, unit: "mΩ" },
  0x14: { scale: 1, unit: "Ω" },
  0x15: { scale: 1, unit: "kΩ" },
  0x16: { scale: 0.1, unit: "°C", offset: -40 },
  0x17: { scale: 0.01, unit: "kPa" },
  0x18: { scale: 0.0117, unit: "kPa" },
  0x19: { scale: 0.079, unit: "kPa" },
  0x1a: { scale: 1, unit: "kPa" },
  0x1b: { scale: 10, unit: "kPa" },
  0x1c: { scale: 0.01, unit: "°" },
  0x1d: { scale: 0.5, unit: "°" },
  0x1e: { scale: 0.0000305, unit: "λ" },
  0x1f: { scale: 0.05, unit: "A/F" },
  0x20: { scale: 0.00390625, unit: "ratio" },
  0x21: { scale: 1, unit: "mHz" },
  0x22: { scale: 1, unit: "Hz" },
  0x23: { scale: 1, unit: "kHz" },
  0x24: { scale: 1, unit: "counts" },
  0x25: { scale: 1, unit: "km" },
  0x26: { scale: 0.1, unit: "mV/ms" },
  0x27: { scale: 0.01, unit: "g/s" },
  0x28: { scale: 1, unit: "g/s" },
  0x29: { scale: 0.25, unit: "Pa/s" },
  0x2a: { scale: 0.001, unit: "kg/h" },
  0x2b: { scale: 1, unit: "switches" },
  0x2c: { scale: 0.01, unit: "g/cyl" },
  0x2d: { scale: 0.01, unit: "mg/stroke" },
  0x2f: { scale: 0.01, unit: "%" },
  0x30: { scale: 0.001526, unit: "%" },
  // Signed twins: same scaling, value is two's complement.
  0x81: { scale: 1, unit: "" },
  0x82: { scale: 0.1, unit: "" },
  0x83: { scale: 0.01, unit: "" },
  0x84: { scale: 0.001, unit: "" },
  0x85: { scale: 0.0000305, unit: "" },
  0x86: { scale: 0.000305, unit: "" },
  0x8a: { scale: 0.122, unit: "mV" },
  0x8b: { scale: 0.001, unit: "V" },
  0x8c: { scale: 0.01, unit: "V" },
  0x8d: { scale: 0.00390625, unit: "mA" },
  0x8e: { scale: 0.001, unit: "A" },
  0x90: { scale: 1, unit: "ms" },
  0x96: { scale: 0.1, unit: "°C" },
};

const bankSensor = (i: number) => `Bank ${(i >> 2) + 1} - Sensor ${(i & 3) + 1}`;

/** Standard OBD monitor IDs (J1979 Appendix D), cross-checked like UAS. Others are shown as "MID 0xNN". */
export function midName(mid: number): string {
  if (mid >= 0x01 && mid <= 0x10) return `O2 Sensor Monitor ${bankSensor(mid - 0x01)}`;
  if (mid >= 0x21 && mid <= 0x24) return `Catalyst Monitor Bank ${mid - 0x20}`;
  if (mid >= 0x31 && mid <= 0x34) return `EGR Monitor Bank ${mid - 0x30}`;
  if (mid >= 0x35 && mid <= 0x38) return `VVT Monitor Bank ${mid - 0x34}`;
  const evap: Record<number, string> = {
    0x39: 'EVAP Monitor (Cap Off / 0.150")',
    0x3a: 'EVAP Monitor (0.090")',
    0x3b: 'EVAP Monitor (0.040")',
    0x3c: 'EVAP Monitor (0.020")',
    0x3d: "Purge Flow Monitor",
  };
  if (evap[mid]) return evap[mid];
  if (mid >= 0x41 && mid <= 0x50) return `O2 Sensor Heater Monitor ${bankSensor(mid - 0x41)}`;
  if (mid >= 0x61 && mid <= 0x64) return `Heated Catalyst Monitor Bank ${mid - 0x60}`;
  if (mid >= 0x71 && mid <= 0x74) return `Secondary Air Monitor ${mid - 0x70}`;
  if (mid >= 0x81 && mid <= 0x84) return `Fuel System Monitor Bank ${mid - 0x80}`;
  if (mid === 0xa1) return "Misfire Monitor General Data";
  if (mid >= 0xa2 && mid <= 0xad) return `Misfire Cylinder ${mid - 0xa1} Data`;
  return `MID 0x${hex2(mid)}`;
}

export interface MonitorTest {
  mid: number;
  tid: number;
  uasid: number;
  /** Unit from the UAS table; null when the UASID is not in it (values are then raw 16-bit). */
  unit: string | null;
  value: number;
  min: number;
  max: number;
  pass: boolean;
}

/** One raw 16-bit field → scaled value. Unknown UASIDs stay raw (unsigned). */
export function scaleUas(uasid: number, raw: number): number {
  const u = UAS[uasid];
  if (!u) return raw;
  const v = uasid & 0x80 && raw & 0x8000 ? raw - 0x10000 : raw;
  return v * u.scale + (u.offset ?? 0);
}

/** CAN Mode 06 reply → tests. Each record after "46" is 9 bytes: MID TID UASID V V MIN MIN MAX MAX. */
export function parseMode06(lines: string[]): MonitorTest[] {
  const out: MonitorTest[] = [];
  for (const m of parseMessages(lines)) {
    if (m[0] !== 0x46) continue;
    for (let i = 1; i + 9 <= m.length; i += 9) {
      const [mid, tid, uasid, v1, v2, n1, n2, x1, x2] = m.slice(i, i + 9) as number[];
      const raw = [(v1! << 8) | v2!, (n1! << 8) | n2!, (x1! << 8) | x2!];
      const [value, min, max] = raw.map((r) => scaleUas(uasid!, r)) as [number, number, number];
      out.push({ mid: mid!, tid: tid!, uasid: uasid!, unit: UAS[uasid!]?.unit ?? null, value, min, max, pass: value >= min && value <= max });
    }
  }
  return out;
}

/** Walks 0600 → 0620 → … like Mode 01 bitmasks; returns the supported test MIDs (not the range MIDs). */
export async function supportedMids(client: Sender): Promise<number[]> {
  const mids = new Set<number>();
  for (let base = 0; base <= 0xe0; base += 0x20) {
    let lines: string[];
    try {
      lines = await client.send(`06${hex2(base)}`, { timeoutMs: 5000 });
    } catch (e) {
      if (e instanceof ElmError && e.code === "NO_DATA") break;
      throw e;
    }
    for (const m of parseMessages(lines)) {
      if (m[0] === 0x46 && m[1] === base) parseBitmask(base, m.slice(2, 6)).forEach((id) => mids.add(parseInt(id.slice(2), 16)));
    }
    if (!mids.has(base + 0x20)) break;
  }
  return [...mids].filter((m) => m % 0x20 !== 0).sort((a, b) => a - b);
}

export async function readMode06(client: Sender): Promise<MonitorTest[]> {
  const tests: MonitorTest[] = [];
  for (const mid of await supportedMids(client)) {
    try {
      tests.push(...parseMode06(await client.send(`06${hex2(mid)}`, { timeoutMs: 5000 })).filter((t) => t.mid === mid));
    } catch (e) {
      if (!(e instanceof ElmError && e.code === "NO_DATA")) throw e;
    }
  }
  return tests;
}
