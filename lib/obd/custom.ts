/**
 * User-defined PIDs (manufacturer Mode 21/22 etc.), like Torque Pro's "extended PIDs". Every definition comes from
 * the user; the app ships none. See docs/custom-pids.md.
 */
import { canIdChars } from "../ecu/headers";
import { ElmError } from "../elm/ElmClient";
import type { Tier } from "../polling/Scheduler";
import { compile } from "./formula";
import { hexBytes, parseMessages } from "./parse";
import type { GaugeType } from "./pids";
import { hex2 } from "./supported";

type Sender = { send: (cmd: string, opts?: { timeoutMs?: number }) => Promise<string[]> };

export interface CustomPid {
  id: string;
  name: string;
  unit: string;
  /** Hex request, e.g. "221234". */
  request: string;
  /** ATSH value ("7E0", or 6 digits on 29-bit CAN); "" keeps the adapter's default. */
  header: string;
  /** Hex the reply must start with; "" derives it from the request (mode + 0x40, then the PID bytes). */
  prefix: string;
  /** Over the data bytes after the prefix: A, B, C… (lib/obd/formula.ts). */
  formula: string;
  min: number;
  max: number;
  gauge: GaugeType;
  tier: Tier;
  enabled: boolean;
}

const HEX = /^([0-9A-F]{2})+$/;
const GAUGES: GaugeType[] = ["dial", "bar", "number"];
const TIER_LIST: Tier[] = ["fast", "medium", "slow"];
const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, "").toUpperCase() : "");

export const newCustomId = () => `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** "221234" → "621234": a positive reply echoes the mode + 0x40, then the PID / DID bytes. */
export function defaultPrefix(request: string): string {
  const b = hexBytes(request);
  return [hex2((b[0]! + 0x40) & 0xff), ...b.slice(1).map(hex2)].join("");
}

/** The first thing wrong with a definition, or null when it can be polled. */
export function validateCustomPid(p: CustomPid): string | null {
  if (!p.name.trim()) return "Give it a name.";
  if (!HEX.test(p.request) || p.request.length > 14) return "Request must be 1 to 7 hex bytes, e.g. 221234.";
  if (p.header && !/^([0-9A-F]{3}|[0-9A-F]{6})$/.test(p.header)) return "Header must be 3 hex digits (11-bit CAN, e.g. 7E0) or 6 (29-bit CAN).";
  if (p.prefix && !HEX.test(p.prefix)) return "Response prefix must be hex bytes, e.g. 621234.";
  if (!(p.max > p.min)) return "Max must be greater than min.";
  try {
    compile(p.formula);
  } catch (e) {
    return `Formula: ${(e as Error).message}`;
  }
  return null;
}

/**
 * Untrusted JSON (settings.json, an imported file) → definitions with the right field types. Entries without a
 * request are skipped; other fields fall back to defaults so a hand-edit doesn't lose the whole list.
 */
export function sanitizeCustomPids(v: unknown): CustomPid[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  return v.flatMap((x): CustomPid[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const request = clean(o.request);
    if (!request) return [];
    let id = typeof o.id === "string" && o.id ? o.id : newCustomId();
    if (seen.has(id)) id = newCustomId();
    seen.add(id);
    const num = (n: unknown, d: number) => (typeof n === "number" && Number.isFinite(n) ? n : d);
    return [{
      id,
      name: typeof o.name === "string" ? o.name : request,
      unit: typeof o.unit === "string" ? o.unit : "",
      request,
      header: clean(o.header),
      prefix: clean(o.prefix),
      formula: typeof o.formula === "string" ? o.formula : "A",
      min: num(o.min, 0),
      max: num(o.max, 255),
      gauge: GAUGES.includes(o.gauge as GaugeType) ? (o.gauge as GaugeType) : "number",
      tier: TIER_LIST.includes(o.tier as Tier) ? (o.tier as Tier) : "medium",
      enabled: o.enabled !== false,
    }];
  });
}

/** Data bytes after `prefix` in the first message that starts with it. A UDS negative reply (7F) gets its own error. */
export function matchReply(lines: string[], prefix: string): number[] {
  const want = hexBytes(prefix);
  const msgs = parseMessages(lines);
  const hit = msgs.find((m) => want.every((b, i) => m[i] === b));
  if (hit) return hit.slice(want.length);
  const neg = msgs.find((m) => m[0] === 0x7f && m[1] === (want[0]! - 0x40));
  if (neg) throw new Error(`ECU refused the request (negative response 7F, code 0x${hex2(neg[2] ?? 0)})`);
  throw new Error(`Reply doesn't start with ${prefix}`);
}

export function decodeCustom(p: CustomPid, lines: string[]): number {
  return compile(p.formula).evaluate(matchReply(lines, p.prefix || defaultPrefix(p.request)));
}

/**
 * The header the adapter uses when none is set: the ISO 15765-4 functional request ID, 7DF on 11-bit CAN and
 * 18DB33F1 on 29-bit (ATSH sets the low 3 bytes; the 18 priority is ATCP's default) [verify]. Null when not CAN.
 */
export function defaultHeader(dpn: string): string | null {
  const n = canIdChars(dpn);
  return n === 3 ? "7DF" : n === 8 ? "DB33F1" : null;
}

/** Runs fn with ATSH <header> and always sets the default header back, also when fn or the ATSH fails. */
export async function withHeader<T>(client: Sender, header: string, dpn: string, fn: () => Promise<T>): Promise<T> {
  const restore = defaultHeader(dpn);
  if (!header || header === restore) return fn();
  if (!restore) throw new Error("Custom headers need an ISO 15765-4 CAN protocol");
  if (header.length !== restore.length) throw new Error(`Header ${header} doesn't fit this car's ${restore.length === 3 ? "11" : "29"}-bit CAN IDs`);
  let result: T;
  try {
    await client.send(`ATSH${header}`);
    result = await fn();
  } catch (e) {
    await client.send(`ATSH${restore}`).catch(() => {}); // the original error matters more than a failed restore
    throw e;
  }
  await client.send(`ATSH${restore}`);
  return result;
}

export type GroupResult = { id: string; value: number } | { id: string; error: unknown };

/** Reads several custom PIDs that share one header with a single header switch. A disconnect aborts the group. */
export function readCustomGroup(client: Sender, header: string, defs: CustomPid[], dpn: string): Promise<GroupResult[]> {
  return withHeader(client, header, dpn, async () => {
    const out: GroupResult[] = [];
    for (const d of defs) {
      try {
        out.push({ id: d.id, value: decodeCustom(d, await client.send(d.request)) });
      } catch (e) {
        if (e instanceof ElmError && e.code === "DISCONNECTED") throw e;
        out.push({ id: d.id, error: e });
      }
    }
    return out;
  });
}

/** "Test once": the raw reply lines plus the decoded value or the error. Callers pause polling around it. */
export async function testCustomPid(client: Sender, p: CustomPid, dpn: string): Promise<{ lines: string[]; value?: number; error?: string }> {
  let lines: string[] = [];
  try {
    const value = await withHeader(client, p.header, dpn, async () => {
      lines = await client.send(p.request, { timeoutMs: 5000 });
      return decodeCustom(p, lines);
    });
    return { lines, value };
  } catch (e) {
    const raw = !lines.length && e instanceof ElmError && e.raw ? [e.raw] : lines;
    return { lines: raw, error: e instanceof Error ? e.message : String(e) };
  }
}
