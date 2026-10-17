import { Emitter, type Transport } from "../transport/types";

export type ElmErrorCode =
  | "NO_DATA"
  | "UNABLE_TO_CONNECT"
  | "BUS_INIT"
  | "UNKNOWN_COMMAND"
  | "STOPPED"
  | "CAN_ERROR"
  | "ADAPTER_ERROR"
  | "TIMEOUT"
  | "DISCONNECTED";

export class ElmError extends Error {
  constructor(
    readonly code: ElmErrorCode,
    readonly command: string,
    readonly raw = "",
  ) {
    super(`${command}: ${code}${raw ? ` (${raw})` : ""}`);
    this.name = "ElmError";
  }
}

export type TrafficEvent = { dir: "tx" | "rx" | "info" | "error"; text: string; t: number };
export type ClientStatus = "connected" | "reconnecting" | "disconnected";
export interface InitInfo {
  elmVersion: string;
  /** Raw ATDPN answer, e.g. "A6". Empty when the vehicle did not answer. */
  protocol: string;
  /** Set when the adapter answered but the car did not (ignition off, unsupported bus). */
  vehicleError?: ElmErrorCode;
}

const ERROR_LINES: [RegExp, ElmErrorCode][] = [
  [/^NO DATA$/, "NO_DATA"],
  [/^UNABLE TO CONNECT$/, "UNABLE_TO_CONNECT"],
  [/^BUS INIT.*ERROR$/, "BUS_INIT"],
  [/^\?$/, "UNKNOWN_COMMAND"],
  [/^STOPPED$/, "STOPPED"],
  [/^CAN ERROR$/, "CAN_ERROR"],
  [/^(BUFFER FULL|BUS BUSY|BUS ERROR|DATA ERROR|<RX ERROR|FB ERROR|LV RESET|ERR\d\d)/, "ADAPTER_ERROR"],
];

/**
 * Turns one raw reply (everything before `>`) into payload lines.
 * Drops the echo, SEARCHING..., BUS INIT: ...OK and blank lines; throws ElmError for error replies.
 */
export function cleanResponse(raw: string, cmd: string): string[] {
  const squash = (s: string) => s.replace(/\s+/g, "").toUpperCase();
  const lines = raw
    .replace(/[^\x20-\x7e\r\n]/g, "")
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length && squash(lines[0]!) === squash(cmd)) lines.shift();

  const out: string[] = [];
  for (const line of lines) {
    const l = line.replace(/^SEARCHING\.\.\.\s*/i, "").replace(/^BUS INIT:\s*\.*\s*OK\s*/i, "").trim();
    if (!l) continue;
    const upper = l.toUpperCase();
    for (const [re, code] of ERROR_LINES) if (re.test(upper)) throw new ElmError(code, cmd, l);
    out.push(l);
  }
  return out;
}

const DEFAULT_TIMEOUT = 3000;
const SLOW_TIMEOUT = 10000;
const RECONNECT_ATTEMPTS = 3;

interface Pending {
  cmd: string;
  resolve: (lines: string[]) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Talks ELM327 over any Transport: one command in flight, replies assembled up to the `>` prompt. */
export class ElmClient {
  private state: "closed" | "open" | "reconnecting" = "closed";
  private userClosing = false;
  private reconnecting = false;
  private chain: Promise<unknown> = Promise.resolve();
  private pending: Pending | null = null;
  private buffer = "";
  private traffic = new Emitter<[TrafficEvent]>();
  private status = new Emitter<[ClientStatus, InitInfo | undefined]>();
  private unsubs: (() => void)[] = [];

  constructor(
    readonly transport: Transport,
    private opts: { reconnectDelayMs?: number } = {},
  ) {}

  get isOpen() {
    return this.state === "open";
  }

  onTraffic(cb: (e: TrafficEvent) => void) {
    return this.traffic.on(cb);
  }

  /** Status changes after connect(): drops, reconnect attempts and their outcome. */
  onStatus(cb: (s: ClientStatus, info?: InitInfo) => void) {
    return this.status.on(cb);
  }

  async connect(): Promise<InitInfo> {
    this.userClosing = false;
    this.unsubs.forEach((u) => u());
    this.unsubs = [this.transport.onData(this.handleData), this.transport.onDisconnect(this.handleDrop)];
    await this.transport.connect();
    this.state = "open";
    this.log("info", "transport connected");
    return this.init();
  }

  async disconnect() {
    this.userClosing = true;
    this.state = "closed";
    this.failPending("DISCONNECTED");
    try {
      await this.transport.disconnect();
    } finally {
      this.unsubs.forEach((u) => u());
      this.unsubs = [];
      this.log("info", "disconnected");
      this.status.emit("disconnected", undefined);
    }
  }

  /** Queue a command. Resolves with cleaned payload lines, rejects with ElmError. */
  send(cmd: string, { timeoutMs = DEFAULT_TIMEOUT } = {}): Promise<string[]> {
    const run = () =>
      new Promise<string[]>((resolve, reject) => {
        if (this.state !== "open") return reject(new ElmError("DISCONNECTED", cmd));
        this.buffer = "";
        const timer = setTimeout(() => {
          // shortcut: a reply that arrives after its timeout is dropped only if it lands before the next write; reset the adapter (ATZ) if replies get out of step.
          this.pending = null;
          this.log("error", `${cmd}: timeout after ${timeoutMs}ms`);
          reject(new ElmError("TIMEOUT", cmd));
        }, timeoutMs);
        this.pending = { cmd, resolve, reject, timer };
        this.log("tx", cmd);
        this.transport.write(`${cmd}\r`).catch((e: unknown) => {
          clearTimeout(timer);
          this.pending = null;
          reject(new ElmError("DISCONNECTED", cmd, e instanceof Error ? e.message : String(e)));
        });
      });
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }

  /** ATZ … ATSP0, then 0100 to make the adapter find the bus, then ATDPN to read what it found. */
  async init(): Promise<InitInfo> {
    const ver = await this.send("ATZ", { timeoutMs: SLOW_TIMEOUT });
    const elmVersion = ver.find((l) => /ELM|v\d/i.test(l)) ?? ver.join(" ");
    for (const cmd of ["ATE0", "ATL0", "ATS0", "ATH0", "ATAT1", "ATSP0"]) await this.send(cmd);
    let vehicleError: ElmErrorCode | undefined;
    try {
      await this.send("0100", { timeoutMs: SLOW_TIMEOUT });
    } catch (e) {
      if (!(e instanceof ElmError) || e.code === "DISCONNECTED") throw e;
      vehicleError = e.code;
      this.log("error", `vehicle did not answer 0100 (${e.code})`);
    }
    const dpn = vehicleError ? [] : await this.send("ATDPN");
    const info: InitInfo = { elmVersion, protocol: dpn[0] ?? "", vehicleError };
    this.log("info", `init done: ${elmVersion}, protocol ${info.protocol || "none"}`);
    return info;
  }

  private handleData = (chunk: string) => {
    this.log("rx", chunk);
    const p = this.pending;
    if (!p) return; // unsolicited bytes (late reply, adapter banner) are only logged
    this.buffer += chunk;
    const end = this.buffer.indexOf(">");
    if (end < 0) return;
    const raw = this.buffer.slice(0, end);
    this.buffer = "";
    this.pending = null;
    clearTimeout(p.timer);
    try {
      p.resolve(cleanResponse(raw, p.cmd));
    } catch (e) {
      p.reject(e as Error);
    }
  };

  private handleDrop = () => {
    if (this.userClosing || this.state === "closed") return;
    this.failPending("DISCONNECTED");
    this.log("error", "link dropped");
    // A drop during a reconnect attempt fails that attempt; the running loop retries.
    if (!this.reconnecting) void this.reconnectLoop().finally(() => (this.reconnecting = false));
  };

  private async reconnectLoop() {
    this.reconnecting = true;
    const reconnect = this.transport.reconnect?.bind(this.transport);
    if (reconnect) {
      this.state = "reconnecting";
      this.status.emit("reconnecting", undefined);
      const base = this.opts.reconnectDelayMs ?? 1000;
      for (let attempt = 1; attempt <= RECONNECT_ATTEMPTS && !this.userClosing; attempt++) {
        await new Promise((r) => setTimeout(r, base * attempt));
        if (this.userClosing) return;
        try {
          this.log("info", `reconnect attempt ${attempt}/${RECONNECT_ATTEMPTS}`);
          await reconnect();
          this.state = "open";
          const info = await this.init();
          this.status.emit("connected", info);
          return;
        } catch (e) {
          this.state = "reconnecting";
          this.log("error", `reconnect failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    if (this.userClosing) return;
    this.state = "closed";
    this.status.emit("disconnected", undefined);
  }

  private failPending(code: ElmErrorCode) {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    clearTimeout(p.timer);
    p.reject(new ElmError(code, p.cmd));
  }

  private log(dir: TrafficEvent["dir"], text: string) {
    this.traffic.emit({ dir, text, t: Date.now() });
  }
}
