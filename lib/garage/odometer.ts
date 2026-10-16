import { ElmError } from "../elm/ElmClient";
import { parseMessages } from "../obd/parse";
import { parseBitmask } from "../obd/supported";

type Sender = { send: (cmd: string, opts?: { timeoutMs?: number }) => Promise<string[]> };

/**
 * PID 01A6 odometer in km, or null when the car doesn't report it (many don't).
 * Checks the 01A0 support mask first. Decoding is SAE J1979 (4 bytes, 0.1 km/bit) [verify] on a real car.
 */
export async function readOdometer(client: Sender): Promise<number | null> {
  try {
    const mask = parseMessages(await client.send("01A0")).find((m) => m[0] === 0x41 && m[1] === 0xa0);
    if (!mask || !parseBitmask(0xa0, mask.slice(2, 6)).includes("01A6")) return null;
    const msg = parseMessages(await client.send("01A6")).find((m) => m[0] === 0x41 && m[1] === 0xa6);
    if (!msg || msg.length < 6) return null;
    return ((msg[2]! * 2 ** 24) + (msg[3]! << 16) + (msg[4]! << 8) + msg[5]!) / 10;
  } catch (e) {
    if (e instanceof ElmError && e.code === "NO_DATA") return null;
    throw e;
  }
}
