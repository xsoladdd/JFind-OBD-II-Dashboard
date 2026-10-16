/**
 * Demo support for custom PIDs: the emulator tracks ATSH and answers two fake Mode 22 DIDs. The DIDs and values are
 * invented for the demo and mean nothing on a real car. Hooked into elm327.ts in two places.
 *  - 22 1234 → 2 bytes, only when the header is 7E0 (a physical request to the engine ECU)
 *  - 22 5678 → 1 byte, with any header
 * Headers other than 7DF / 7E0 / DB33F1 get NO DATA for everything, so tests can tell a missing restore.
 */
import type { EngineState } from "./engine";

export const SIM_DEFAULT_HEADER = "7DF";
const ANSWERED = ["7DF", "7E0", "DB33F1"];

/** "ATSH7E0" → "7E0"; null when cmd isn't an ATSH the emulator accepts. */
export function simHeader(cmd: string): string | null {
  return /^ATSH([0-9A-F]{3}|[0-9A-F]{6})$/.exec(cmd)?.[1] ?? null;
}

/** null = NO DATA, undefined = not ours (normal handling). */
export function customAnswer(header: string, [mode, ...rest]: number[], e: EngineState): number[] | null | undefined {
  if (!ANSWERED.includes(header)) return null;
  if (mode !== 0x22) return undefined;
  const did = ((rest[0] ?? 0) << 8) | (rest[1] ?? 0);
  if (did === 0x1234 && header === "7E0") {
    const v = Math.round((e.oil + 5 + 40) * 10); // demo formula: (A*256+B)/10-40
    return [0x62, 0x12, 0x34, v >> 8, v & 0xff];
  }
  if (did === 0x5678) return [0x62, 0x56, 0x78, Math.max(0, Math.min(255, Math.round((e.throttle * 255) / 100)))];
  return [0x7f, 0x22, 0x31]; // requestOutOfRange, as an ECU answers an unknown DID
}
