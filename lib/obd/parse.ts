import { decodeDtc } from "./dtc";

/** "41 0C 1A F8" or "410C1AF8" → [0x41, 0x0c, 0x1a, 0xf8]. Throws on non-hex. */
export function hexBytes(line: string): number[] {
  const s = line.replace(/\s+/g, "");
  if (!/^([0-9A-Fa-f]{2})+$/.test(s)) throw new Error(`Not a hex response: "${line}"`);
  return s.match(/../g)!.map((h) => parseInt(h, 16));
}

const FRAME = /^([0-9A-F]):\s*(.*)$/i;

/**
 * Header-less (ATH0) reply lines → one byte array per message.
 * CAN ISO-TP replies arrive as a byte-count line ("014") then "0: …", "1: …" frames, which are joined.
 * shortcut: frames from several ECUs answering one multi-frame request would be merged; needs ATH1 parsing to split them.
 */
export function parseMessages(lines: string[]): number[][] {
  if (!lines.some((l) => FRAME.test(l))) return lines.map(hexBytes);
  let total = Infinity;
  const data: number[] = [];
  const singles: number[][] = [];
  for (const l of lines) {
    const m = FRAME.exec(l);
    if (m) data.push(...hexBytes(m[2]!));
    else if (/^[0-9A-F]{3}$/i.test(l)) total = parseInt(l, 16);
    else singles.push(hexBytes(l));
  }
  return [...singles, data.slice(0, total)];
}

/** 0902 reply → VIN string. Handles CAN (one ISO-TP message) and legacy (five "49 02 0N" lines). */
export function parseVin(lines: string[]): string {
  const msgs = parseMessages(lines).filter((m) => m[0] === 0x49 && m[1] === 0x02);
  const bytes =
    msgs.length === 1 && msgs[0]!.length > 7
      ? msgs[0]!.slice(3)
      : msgs.sort((a, b) => (a[2] ?? 0) - (b[2] ?? 0)).flatMap((m) => m.slice(3));
  return String.fromCharCode(...bytes.filter((b) => b >= 0x20 && b < 0x7f)).slice(-17);
}

const DTC_REPLY: Record<string, number> = { "03": 0x43, "07": 0x47, "0A": 0x4a };

/**
 * Mode 03/07/0A reply → DTC list, deduplicated, 0000 padding removed.
 * CAN messages are "43 <count> <pairs…>" (even length); legacy ones are "43 <3 pairs>" (7 bytes).
 */
export function parseDtcResponse(lines: string[], mode: "03" | "07" | "0A"): string[] {
  const codes = new Set<string>();
  for (const m of parseMessages(lines)) {
    if (m[0] !== DTC_REPLY[mode]) continue;
    const pairs = m.length % 2 === 0 ? m.slice(2) : m.slice(1);
    for (let i = 0; i + 1 < pairs.length; i += 2) {
      const code = decodeDtc(pairs[i]!, pairs[i + 1]!);
      if (code) codes.add(code);
    }
  }
  return [...codes];
}
