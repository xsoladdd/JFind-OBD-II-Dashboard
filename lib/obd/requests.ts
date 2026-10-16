import { ElmError } from "../elm/ElmClient";
import { PIDS } from "./pids";
import { parseDtcResponse, parseMessages, parseVin } from "./parse";

type Sender = { send: (cmd: string, opts?: { timeoutMs?: number }) => Promise<string[]> };

/** Reads one registry PID and returns its decoded value. */
export async function readPid(client: Sender, id: string): Promise<number> {
  const def = PIDS[id];
  if (!def) throw new Error(`Unknown PID ${id}`);
  const pid = parseInt(id.slice(2), 16);
  const msg = parseMessages(await client.send(id)).find((m) => m[0] === 0x41 && m[1] === pid);
  if (!msg || msg.length < 2 + def.bytes) throw new Error(`${id}: unexpected reply`);
  return def.decode(msg.slice(2, 2 + def.bytes));
}

/** Mode 03 (stored), 07 (pending) or 0A (permanent) codes. NO DATA means none. */
export async function readDtcs(client: Sender, mode: "03" | "07" | "0A"): Promise<string[]> {
  try {
    return parseDtcResponse(await client.send(mode, { timeoutMs: 5000 }), mode);
  } catch (e) {
    if (e instanceof ElmError && e.code === "NO_DATA") return [];
    throw e;
  }
}

/** Mode 04: clears stored/pending codes and freeze frames. Callers must confirm with the user first. */
export async function clearDtcs(client: Sender): Promise<void> {
  const lines = await client.send("04", { timeoutMs: 5000 });
  if (!parseMessages(lines).some((m) => m[0] === 0x44)) throw new Error("04: clear not acknowledged");
}

export async function readVin(client: Sender): Promise<string> {
  return parseVin(await client.send("0902", { timeoutMs: 5000 }));
}
