import { ElmError } from "../elm/ElmClient";
import { parseMessages } from "./parse";

export const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");

/** 4 bitmask bytes from "41 <base> A B C D" → supported PID ids like "010C". Bit 7 of A is base+1. */
export function parseBitmask(base: number, bytes: number[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < 32; i++) {
    if ((bytes[i >> 3] ?? 0) & (0x80 >> (i & 7))) out.push(`01${hex2(base + i + 1)}`);
  }
  return out;
}

/** Walks 0100 → 0120 → … → 01A0 while each range says the next one exists (01A0 covers 01A4, the gear). */
export async function discoverSupported(client: {
  send: (cmd: string) => Promise<string[]>;
}): Promise<Set<string>> {
  const supported = new Set<string>();
  for (const base of [0x00, 0x20, 0x40, 0x60, 0x80, 0xa0]) {
    let lines: string[];
    try {
      lines = await client.send(`01${hex2(base)}`);
    } catch (e) {
      if (e instanceof ElmError && e.code === "NO_DATA") break;
      throw e;
    }
    // Each answering ECU sends its own mask; the union is what the car supports.
    for (const m of parseMessages(lines)) {
      if (m[0] === 0x41 && m[1] === base) parseBitmask(base, m.slice(2, 6)).forEach((p) => supported.add(p));
    }
    if (!supported.has(`01${hex2(base + 0x20)}`)) break;
  }
  return supported;
}
