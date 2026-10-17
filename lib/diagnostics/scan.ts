import { ElmError } from "../elm/ElmClient";
import { decodeDtc } from "../obd/dtc";
import { parseMessages } from "../obd/parse";
import { PID_LIST, PIDS } from "../obd/pids";
import { clearDtcs, readDtcs, readPid, readVin } from "../obd/requests";
import { hex2, parseBitmask } from "../obd/supported";
import { withPollingPaused } from "../polling/pause";
import { combineStatus, decodeMonitorStatus, type MonitorStatus } from "./readiness";

type Sender = { send: (cmd: string, opts?: { timeoutMs?: number }) => Promise<string[]> };

export interface FreezeValue {
  id: string;
  name: string;
  unit: string;
  value: number;
}

export interface FreezeFrame {
  /** The DTC that stored frame 0 (PID 02), null when the ECU doesn't say. */
  dtc: string | null;
  values: FreezeValue[];
}

export interface Scan {
  /** Epoch ms; also the history key. */
  at: number;
  vin: string | null;
  /** 0101: MIL, DTC count and readiness since codes were last cleared. */
  status: MonitorStatus | null;
  /** 0141: readiness for this drive cycle. */
  thisCycle: MonitorStatus | null;
  /** null = the read failed (see errors); [] = no codes. */
  stored: string[] | null;
  pending: string[] | null;
  permanent: string[] | null;
  freezeFrame: FreezeFrame | null;
  errors: string[];
  afterClear?: boolean;
}

export type ClearOutcome =
  | { status: "blocked"; reason: "engine-running"; rpm: number }
  | { status: "blocked"; reason: "rpm-unreadable"; error: string }
  | { status: "cleared"; after: Scan };

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const isNoData = (e: unknown) => e instanceof ElmError && e.code === "NO_DATA";

const replies = (lines: string[], head: number, pid: number) =>
  parseMessages(lines).filter((m) => m[0] === head && m[1] === pid);

/** Runs one scan step: NO DATA means "not supported" (null), other failures are recorded; a dropped link aborts. */
async function attempt<T>(errors: string[], label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ElmError && e.code === "DISCONNECTED") throw e;
    if (!isNoData(e)) errors.push(`${label}: ${errMsg(e)}`);
    return null;
  }
}

async function readStatus(client: Sender, pid: 0x01 | 0x41): Promise<MonitorStatus | null> {
  const msgs = replies(await client.send(`01${hex2(pid)}`), 0x41, pid);
  return combineStatus(msgs.map((m) => decodeMonitorStatus(m.slice(2, 6))));
}

/** Mode 02 reply "42 <pid> <frame> <data…>" → the value decoded through the Mode 01 registry. */
export function decodeFreezeValue(msg: number[]): FreezeValue | null {
  const def = PIDS[`01${hex2(msg[1] ?? 0)}`];
  if (msg[0] !== 0x42 || !def || msg.length < 3 + def.bytes) return null;
  return { id: def.id, name: def.name, unit: def.unit, value: def.decode(msg.slice(3, 3 + def.bytes)) };
}

/** Freeze frame 0: which DTC stored it, and every registry PID it holds. */
export async function readFreezeFrame(client: Sender): Promise<FreezeFrame | null> {
  const supported = new Set<string>(); // Mode 01 ids ("010C"), as parseBitmask returns them
  for (const base of [0x00, 0x20, 0x40]) {
    const m = replies(await client.send(`02${hex2(base)}00`), 0x42, base)[0];
    if (!m) break;
    parseBitmask(base, m.slice(3, 7)).forEach((p) => supported.add(p));
    if (!supported.has(`01${hex2(base + 0x20)}`)) break;
  }
  const one = async (pid: string) => {
    try {
      return replies(await client.send(`02${pid}00`), 0x42, parseInt(pid, 16))[0] ?? null;
    } catch (e) {
      if (isNoData(e)) return null;
      throw e;
    }
  };
  let dtc: string | null = null;
  if (supported.has("0102")) {
    const m = await one("02");
    dtc = m ? decodeDtc(m[3] ?? 0, m[4] ?? 0) : null;
  }
  const values: FreezeValue[] = [];
  for (const def of PID_LIST) {
    if (!supported.has(def.id)) continue;
    const m = await one(def.id.slice(2));
    const v = m && decodeFreezeValue(m);
    if (v) values.push(v);
  }
  return dtc || values.length ? { dtc, values } : null;
}

/** Everything the Diagnostics page shows, read with live polling paused. */
export function readScan(client: Sender): Promise<Scan> {
  return withPollingPaused(async () => {
    const errors: string[] = [];
    const at = Date.now();
    const status = await attempt(errors, "MIL / readiness (0101)", () => readStatus(client, 0x01));
    const thisCycle = await attempt(errors, "Drive-cycle readiness (0141)", () => readStatus(client, 0x41));
    const stored = await attempt(errors, "Stored codes (03)", () => readDtcs(client, "03"));
    const pending = await attempt(errors, "Pending codes (07)", () => readDtcs(client, "07"));
    const permanent = await attempt(errors, "Permanent codes (0A)", () => readDtcs(client, "0A"));
    const vin = (await attempt(errors, "VIN (0902)", () => readVin(client))) || null;
    const freezeFrame = await attempt(errors, "Freeze frame (02)", () => readFreezeFrame(client));
    return { at, vin, status, thisCycle, stored, pending, permanent, freezeFrame, errors };
  });
}

/**
 * Mode 04 behind an engine-off check: reads 010C right before clearing and refuses unless RPM is exactly 0.
 * Then re-reads everything so the caller can show which codes are gone and which persist.
 * Callers must have the user confirm first.
 */
export function clearCodes(client: Sender): Promise<ClearOutcome> {
  return withPollingPaused(async () => {
    let rpm: number;
    try {
      rpm = await readPid(client, "010C");
    } catch (e) {
      return { status: "blocked", reason: "rpm-unreadable", error: errMsg(e) };
    }
    if (rpm > 0) return { status: "blocked", reason: "engine-running", rpm };
    await clearDtcs(client);
    return { status: "cleared", after: { ...(await readScan(client)), afterClear: true } };
  });
}
