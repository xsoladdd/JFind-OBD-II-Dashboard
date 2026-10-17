/** A byte pipe to an ELM327-style adapter. Text in, text chunks out (chunks are arbitrary splits). */
export interface Transport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Writes raw text; the caller adds the `\r` terminator. */
  write(text: string): Promise<void>;
  onData(cb: (chunk: string) => void): () => void;
  /** Fires when the link drops for any reason, including our own disconnect(). */
  onDisconnect(cb: () => void): () => void;
  /** Re-establish a dropped link without user interaction (no device picker). */
  reconnect?(): Promise<void>;
}

/** Tiny listener set shared by transports. */
export class Emitter<T extends unknown[]> {
  private fns = new Set<(...args: T) => void>();
  on(fn: (...args: T) => void) {
    this.fns.add(fn);
    return () => void this.fns.delete(fn);
  }
  emit(...args: T) {
    for (const fn of this.fns) fn(...args);
  }
}
