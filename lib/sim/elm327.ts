import { encodeDtc } from "../obd/dtc";
import { ReturnAfterClear } from "./codeHistory";
import { hex2 } from "../obd/supported";
import { batteryVolts, headerLines, mode06Reply, mode09Reply, type SimBattery } from "./advanced";
import { engineAt, rng, type EngineState } from "./engine";
import { customAnswer, SIM_DEFAULT_HEADER, simHeader } from "./customPids";
import { garageAnswer } from "./garage";
import { withPull } from "./dyno";
import { MORE_ENCODERS } from "./morePids";
import { withLaunch } from "./trips";

const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const word = (n: number) => {
  const v = Math.max(0, Math.min(0xffff, Math.round(n)));
  return [v >> 8, v & 0xff];
};
const pct = (n: number) => [clampByte((n * 255) / 100)];
const temp = (n: number) => [clampByte(n + 40)];
const trim = (n: number) => [clampByte(((n + 100) * 128) / 100)];

/** Mode 01 PID → encoder from engine state. Inverse of lib/obd/pids decoders. */
const ENCODERS: Record<number, (e: EngineState) => number[]> = {
  0x04: (e) => pct(e.load),
  0x05: (e) => temp(e.coolant),
  0x06: (e) => trim(e.stft),
  0x07: (e) => trim(e.ltft),
  0x0a: (e) => [clampByte(e.fuelPressure / 3)],
  0x0b: (e) => [clampByte(e.map)],
  0x0c: (e) => word(e.rpm * 4),
  0x0d: (e) => [clampByte(e.speed)],
  0x0e: (e) => [clampByte((e.timing + 64) * 2)],
  0x0f: (e) => temp(e.iat),
  0x10: (e) => word(e.maf * 100),
  0x11: (e) => pct(e.throttle),
  0x1f: (e) => word(e.runTime),
  0x2f: (e) => pct(e.fuelLevel),
  0x33: (e) => [clampByte(e.baro)],
  0x42: (e) => word(e.moduleVoltage * 1000),
  0x46: (e) => temp(e.ambient),
  0x5c: (e) => temp(e.oil),
  0x5e: (e) => word(e.fuelRate * 20),
  ...MORE_ENCODERS,
};

export const SIM_VIN = "SIMULATOR0VIN0001"; // deliberately not a real VIN
export const SIM_DTCS = { stored: ["P0133", "P0420"], pending: ["P0300"], permanent: ["P0420"] };
const FREEZE_PIDS = [0x04, 0x05, 0x06, 0x07, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11];

// --- Diagnostics (phase 2) ---
// Readiness bytes B, C, D of PID 01/41 (SAE J1979 layout): spark ignition; misfire, fuel system and components
// supported; catalyst, EVAP, O2 sensor and O2 heater supported (C = 0x65). Demo data, not from a real car.
const MON_B = 0x07;
const MON_C = 0x65;
const ENGINE_OFF = { rpm: 0, speed: 0, throttle: 0, load: 0, maf: 0, fuelRate: 0 };

/** Bitmask for range base: bits for supported PIDs in base+1..base+0x20, last bit = next range exists. */
export function bitmask(base: number, supported: number[]): number[] {
  const bytes = [0, 0, 0, 0];
  for (const pid of supported) {
    const i = pid - base - 1;
    if (i >= 0 && i < 32) bytes[i >> 3]! |= 0x80 >> (i & 7);
  }
  if (supported.some((p) => p > base + 0x20)) bytes[3]! |= 0x01;
  return bytes;
}

export interface Elm327Options {
  seed?: number;
  /** Seconds since "engine start"; defaults to wall clock since construction. */
  clock?: () => number;
  /** Dashboard tests: Mode 01 PIDs this "car" doesn't support (left out of the bitmask, answered NO DATA). */
  unsupported?: number[];
}

/** A pure ELM327 v1.5 emulator on CAN 11/500: command text in, full reply text (with echo and `>`) out. */
export class Elm327Emulator {
  private echo = true;
  private linefeeds = true;
  private spaces = true;
  private protocolSet = "0";
  private detected = false;
  private headers = false;
  private header = SIM_DEFAULT_HEADER; // ATSH (lib/sim/customPids.ts)
  /** Set by the /ecu battery test in Demo mode; null keeps the plain 12.4 / 14.1 V behaviour. */
  battery: SimBattery | null = null;
  private stored = [...SIM_DTCS.stored];
  private pending = [...SIM_DTCS.pending];
  private permanent = [...SIM_DTCS.permanent];
  private returning = new ReturnAfterClear();
  private freeze: EngineState | null;
  private rand: () => number;
  private clock: () => number;
  private unsupported: number[];
  /** Diagnostics (phase 2): false = key on, engine off (RPM 0). Demo mode toggles it before a Mode 04 clear. */
  engineRunning = true;
  /** Diagnostics (phase 2): set by Mode 04, which resets the non-continuous monitors (byte D) to incomplete. */
  private monitorsReset = false;

  constructor(opts: Elm327Options = {}) {
    this.rand = rng(opts.seed ?? 1);
    const start = Date.now();
    this.clock = opts.clock ?? (() => (Date.now() - start) / 1000);
    this.unsupported = opts.unsupported ?? [];
    this.freeze = engineAt(32, rng(7)); // the "moment" P0133 was set, mid-cruise
  }

  /** One command (no `\r`) → the bytes an ELM327 would send back, ending with the prompt. */
  handle(raw: string): string {
    const cmd = raw.replace(/\s+/g, "").toUpperCase();
    const body = cmd.startsWith("AT") ? this.at(cmd) : this.obd(cmd);
    const eol = this.linefeeds ? "\r\n" : "\r";
    const echo = this.echo ? raw + eol : "";
    return `${echo}${body.join(eol)}${eol}${eol}>`;
  }

  get supportedPids(): number[] {
    return [0x01, 0x41, ...Object.keys(ENCODERS).map(Number)].filter((p) => !this.unsupported.includes(p)).sort((a, b) => a - b);
  }

  private at(cmd: string): string[] {
    const flag = (prefix: string) => cmd === `${prefix}1` || cmd === `${prefix}0`;
    if (cmd === "ATZ" || cmd === "ATWS") {
      this.echo = this.linefeeds = this.spaces = true;
      this.headers = false;
      this.header = SIM_DEFAULT_HEADER;
      this.protocolSet = "0";
      this.detected = false;
      return ["", "ELM327 v1.5"];
    }
    if (cmd === "ATI") return ["ELM327 v1.5"];
    if (cmd === "AT@1") return ["OBDII to RS232 Interpreter"];
    if (cmd === "ATRV") {
      const base = this.battery ? batteryVolts(this.battery) : this.detected ? 14.1 : 12.4;
      return [`${(base + (this.rand() - 0.5) * 0.1).toFixed(1)}V`];
    }
    if (cmd === "ATDPN") {
      if (this.protocolSet !== "0") return [this.protocolSet];
      return [this.detected ? "A6" : "A0"];
    }
    if (cmd === "ATDP") return [this.detected ? "AUTO, ISO 15765-4 (CAN 11/500)" : "AUTO"];
    if (flag("ATE")) this.echo = cmd.endsWith("1");
    else if (flag("ATL")) this.linefeeds = cmd.endsWith("1");
    else if (flag("ATS")) this.spaces = cmd.endsWith("1");
    else if (/^ATSP[0-9A-C]$/.test(cmd) || /^ATTP[0-9A-C]$/.test(cmd)) {
      // Only CAN 11/500 is emulated; asking for another protocol behaves like a car that won't answer it.
      this.protocolSet = cmd.slice(4);
      this.detected = false;
    }
    else if (flag("ATH")) this.headers = cmd.endsWith("1");
    else if (simHeader(cmd)) this.header = simHeader(cmd)!;
    else if (!(/^ATAT[012]$/.test(cmd) || /^ATST[0-9A-F]{2}$/.test(cmd) || cmd === "ATD" || flag("ATM")))
      return ["?"];
    return ["OK"];
  }

  private obd(cmd: string): string[] {
    if (!/^([0-9A-F]{2})+$/.test(cmd)) return ["?"];
    if (this.protocolSet !== "0" && this.protocolSet !== "6") return ["SEARCHING...", "UNABLE TO CONNECT"];
    const prefix = this.detected ? [] : ["SEARCHING..."];
    this.detected = true;
    const bytes = cmd.match(/../g)!.map((h) => parseInt(h, 16));
    const reply = this.answer(bytes);
    if (this.headers) {
      const lines = headerLines(bytes, reply, this.spaces);
      return [...prefix, ...(lines.length ? lines : ["NO DATA"])];
    }
    return [...prefix, ...(reply ? this.frame(reply) : ["NO DATA"])];
  }

  private answer(bytes: number[]): number[] | null {
    const [mode, pid, frameNo] = bytes;
    const e = withPull(withLaunch({ ...engineAt(this.clock(), this.rand), ...(this.engineRunning ? {} : ENGINE_OFF) }));
    const custom = customAnswer(this.header, bytes, e);
    if (custom !== undefined) return custom;
    const extra = garageAnswer(mode!, pid);
    if (extra) return extra;
    switch (mode) {
      case 0x01:
        if (pid === undefined) return null;
        if (pid % 0x20 === 0) return pid <= 0x60 ? [0x41, pid, ...bitmask(pid, this.supportedPids)] : null;
        if (pid === 0x01)
          return [0x41, 0x01, (this.stored.length ? 0x80 : 0) | this.stored.length, MON_B, MON_C, this.monitorsReset ? MON_C : 0x00];
        if (pid === 0x41) return [0x41, 0x41, 0x00, MON_B, MON_C, this.monitorsReset ? MON_C : 0x04]; // EVAP still running this drive cycle
        return ENCODERS[pid] && !this.unsupported.includes(pid) ? [0x41, pid, ...ENCODERS[pid](e)] : null;
      case 0x02: {
        if (pid === undefined || !this.freeze || (frameNo !== undefined && frameNo !== 0x00)) return null;
        if (pid === 0x00) return [0x42, 0x00, 0x00, ...bitmask(0, [0x02, ...FREEZE_PIDS])];
        if (pid === 0x02) return [0x42, 0x02, 0x00, ...encodeDtc(this.stored[0] ?? "P0000")];
        return FREEZE_PIDS.includes(pid) ? [0x42, pid, 0x00, ...ENCODERS[pid]!(this.freeze)] : null;
      }
      case 0x03:
        return this.dtcReply(0x43, this.stored);
      case 0x07:
        return this.dtcReply(0x47, this.returning.pending(this.pending));
      case 0x0a:
        return this.dtcReply(0x4a, this.permanent);
      case 0x04:
        this.stored = [];
        this.pending = [];
        this.freeze = null; // permanent codes survive a clear, as on a real car
        this.monitorsReset = true;
        this.returning.cleared();
        return [0x44];
      case 0x09:
        if (pid === 0x02) return [0x49, 0x02, 0x01, ...[...SIM_VIN].map((c) => c.charCodeAt(0))];
        return mode09Reply(pid);
      case 0x06:
        return mode06Reply(pid);
      default:
        return null;
    }
  }

  private dtcReply(head: number, codes: string[]) {
    return [head, codes.length, ...codes.flatMap(encodeDtc)];
  }

  /** CAN header-less formatting: single frame ≤ 7 bytes, else byte count + "N: …" frames (6 then 7 bytes). */
  private frame(payload: number[]): string[] {
    const fmt = (b: number[]) => b.map(hex2).join(this.spaces ? " " : "");
    if (payload.length <= 7) return [fmt(payload)];
    const lines = [payload.length.toString(16).toUpperCase().padStart(3, "0")];
    const sep = this.spaces ? ": " : ":";
    lines.push(`0${sep}${fmt(payload.slice(0, 6))}`);
    for (let i = 6, n = 1; i < payload.length; i += 7, n++) {
      lines.push(`${(n % 16).toString(16).toUpperCase()}${sep}${fmt(payload.slice(i, i + 7))}`);
    }
    return lines;
  }
}
