import { ElmError } from "../elm/ElmClient";
import { cmdOf, PID_LIST, PIDS } from "./pids";
import { parseDtcResponse, parseMessages, parseVin } from "./parse";

type Sender = { send: (cmd: string, opts?: { timeoutMs?: number }) => Promise<string[]> };

/** Sends one Mode 01 command and decodes every registry entry that shares it: [id, value] pairs. */
export async function readCmd(client: Sender, cmd: string): Promise<[string, number][]> {
  const defs = PID_LIST.filter((p) => cmdOf(p) === cmd);
  if (!defs.length) throw new Error(`Unknown PID ${cmd}`);
  const pid = parseInt(cmd.slice(2), 16);
  const msg = parseMessages(await client.send(cmd)).find((m) => m[0] === 0x41 && m[1] === pid);
  if (!msg || msg.length < 2 + defs[0]!.bytes) throw new Error(`${cmd}: unexpected reply`);
  return defs.map((d) => [d.id, d.decode(msg.slice(2, 2 + d.bytes))]);
}

/** Reads one registry PID and returns its decoded value. */
export async function readPid(client: Sender, id: string): Promise<number> {
  const def = PIDS[id];
  if (!def) throw new Error(`Unknown PID ${id}`);
  return (await readCmd(client, cmdOf(def))).find(([i]) => i === id)![1];
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
