import { ElmError } from "../elm/ElmClient";
import { describeProtocol } from "../elm/protocols";
import { parseDtcResponse, parseVin, hexBytes } from "../obd/parse";
import { hex2 } from "../obd/supported";
import { parseEcuName } from "./mode09";

type Sender = { send: (cmd: string, opts?: { timeoutMs?: number }) => Promise<string[]> };

/** Hex characters of the CAN ID that ATH1 puts in front of each frame: 3 for 11-bit, 8 for 29-bit, null when not OBD CAN. */
export function canIdChars(dpn: string): 3 | 8 | null {
  const n = describeProtocol(dpn).number;
  return n === "6" || n === "8" ? 3 : n === "7" || n === "9" ? 8 : null;
}

/** Runs fn with headers on (ATH1) and always turns them off again (ATH0), also when fn or ATH1 fails. */
export async function withHeaders<T>(client: Sender, fn: () => Promise<T>): Promise<T> {
  let result: T;
  try {
    await client.send("ATH1");
    result = await fn();
  } catch (e) {
    await client.send("ATH0").catch(() => {}); // the original error matters more than a failed restore
    throw e;
  }
  await client.send("ATH0");
  return result;
}

/**
 * ATH1 CAN reply lines → per CAN ID, one header-less hex line per message, so the ATH0 parsers apply unchanged.
 * Frames are reassembled by their ISO-TP PCI byte (0 single, 1 first, 2 consecutive); CAN padding is cut off.
 */
export function splitByEcu(lines: string[], idChars: number): Map<string, string[]> {
  const frames = new Map<string, number[][]>();
  for (const line of lines) {
    const s = line.replace(/\s+/g, "").toUpperCase();
    const id = s.slice(0, idChars);
    frames.set(id, [...(frames.get(id) ?? []), hexBytes(s.slice(idChars))]);
  }
  const out = new Map<string, string[]>();
  for (const [id, fs] of frames) {
    const msgs: { data: number[]; len: number }[] = [];
    let cur: { data: number[]; len: number } | null = null;
    for (const f of fs) {
      const pci = f[0] ?? 0;
      if (pci >> 4 === 0) msgs.push({ data: f.slice(1), len: pci & 0xf });
      else if (pci >> 4 === 1) msgs.push((cur = { data: f.slice(2), len: ((pci & 0xf) << 8) | (f[1] ?? 0) }));
      else if (pci >> 4 === 2 && cur) cur.data.push(...f.slice(1));
    }
    out.set(id, msgs.map((m) => m.data.slice(0, m.len).map(hex2).join("")));
  }
  return out;
}

/**
 * ISO 15765-4 numbers the 11-bit response IDs 7E8…7EF as ECU #1…#8. Which module that is (engine, gearbox…) is a
 * convention, not part of the standard, so the hint carries [verify]. The ECU's own 090A name is the real answer.
 */
export function ecuLabel(id: string): { label: string; hint: string } {
  const n = parseInt(id, 16);
  if (id.length === 3 && n >= 0x7e8 && n <= 0x7ef) {
    const hint = n === 0x7e8 ? "usually Engine [verify]" : n === 0x7e9 ? "usually Transmission [verify]" : "";
    return { label: `ECU #${n - 0x7e7}`, hint };
  }
  if (id.length === 8) return { label: `ECU 0x${id.slice(6)}`, hint: "" };
  return { label: `ID ${id}`, hint: "" };
}

export interface EcuReport {
  id: string;
  label: string;
  hint: string;
  name: string;
  vin: string;
  stored: string[];
  pending: string[];
  permanent: string[];
}

/** Stored, pending and permanent DTCs, VIN and ECU name, per answering module. CAN only. */
export async function readPerEcu(client: Sender, dpn: string): Promise<EcuReport[]> {
  const idChars = canIdChars(dpn);
  if (!idChars) throw new Error(`Per-ECU reads need an ISO 15765-4 CAN protocol; this car reports "${describeProtocol(dpn).name}".`);
  const ecus = new Map<string, EcuReport>();
  const ecu = (id: string) => {
    if (!ecus.has(id)) ecus.set(id, { id, ...ecuLabel(id), name: "", vin: "", stored: [], pending: [], permanent: [] });
    return ecus.get(id)!;
  };
  const query = async (cmd: string) => {
    try {
      return splitByEcu(await client.send(cmd, { timeoutMs: 5000 }), idChars);
    } catch (e) {
      if (e instanceof ElmError && e.code === "NO_DATA") return new Map<string, string[]>();
      throw e;
    }
  };
  await withHeaders(client, async () => {
    for (const [mode, key] of [["03", "stored"], ["07", "pending"], ["0A", "permanent"]] as const) {
      for (const [id, lines] of await query(mode)) ecu(id)[key] = parseDtcResponse(lines, mode);
    }
    for (const [id, lines] of await query("0902")) ecu(id).vin = parseVin(lines);
    for (const [id, lines] of await query("090A")) ecu(id).name = parseEcuName(lines);
  });
  return [...ecus.values()].sort((a, b) => a.id.localeCompare(b.id));
}
