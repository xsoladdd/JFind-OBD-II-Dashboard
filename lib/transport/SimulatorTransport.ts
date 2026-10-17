import { Elm327Emulator, type Elm327Options } from "../sim/elm327";
import { Emitter, type Transport } from "./types";

export interface SimulatorOptions extends Elm327Options {
  /** Reply chunk size in bytes: fixed, or a [min, max] range picked randomly per chunk. */
  chunkSize?: number | [number, number];
  /** Delay before each chunk, mimicking BLE notification spacing. */
  delayMs?: number;
}

/** An ELM327 adapter in memory. Replies are split into small chunks like BLE notifications. */
export class SimulatorTransport implements Transport {
  readonly emulator: Elm327Emulator;
  private connected = false;
  private input = "";
  private outQueue: Promise<void> = Promise.resolve();
  private data = new Emitter<[string]>();
  private dropped = new Emitter<[]>();

  constructor(private opts: SimulatorOptions = {}) {
    this.emulator = new Elm327Emulator(opts);
  }

  async connect() {
    this.connected = true;
  }

  async reconnect() {
    this.connected = true;
  }

  async disconnect() {
    if (!this.connected) return;
    this.connected = false;
    this.dropped.emit();
  }

  /** Test hook: behave like the adapter losing power or going out of range. */
  simulateDrop() {
    this.connected = false;
    this.dropped.emit();
  }

  async write(text: string) {
    if (!this.connected) throw new Error("Simulator not connected");
    this.input += text;
    let i: number;
    while ((i = this.input.indexOf("\r")) >= 0) {
      const cmd = this.input.slice(0, i);
      this.input = this.input.slice(i + 1);
      this.reply(this.emulator.handle(cmd));
    }
  }

  onData(cb: (chunk: string) => void) {
    return this.data.on(cb);
  }

  onDisconnect(cb: () => void) {
    return this.dropped.on(cb);
  }

  private reply(text: string) {
    const { chunkSize = [1, 20], delayMs = 15 } = this.opts;
    const chunks: string[] = [];
    for (let i = 0; i < text.length; ) {
      const n = typeof chunkSize === "number" ? chunkSize : chunkSize[0] + Math.floor(Math.random() * (chunkSize[1] - chunkSize[0] + 1));
      chunks.push(text.slice(i, i + n));
      i += n;
    }
    // Chained so replies never interleave, and always async like a real radio link.
    for (const c of chunks) {
      this.outQueue = this.outQueue.then(
        () =>
          new Promise<void>((r) =>
            setTimeout(() => {
              if (this.connected) this.data.emit(c);
              r();
            }, delayMs),
          ),
      );
    }
  }
}
