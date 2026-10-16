import { ElmError } from "../elm/ElmClient";
import { PID_LIST } from "../obd/pids";
import { readPid } from "../obd/requests";
import { discoverSupported } from "../obd/supported";
import { ATRV } from "../store/live";
import { usePollingPause } from "./pause";

type Sender = { send: (cmd: string, opts?: { timeoutMs?: number }) => Promise<string[]> };
export type Tier = "fast" | "medium" | "slow";

/** Default tier per item; anything not listed is medium. requestFast() promotes items at runtime. */
export const TIERS: Record<string, Tier> = {
  "010C": "fast", // RPM
  "010D": "fast", // speed
  "0111": "fast", // throttle
  "0104": "fast", // load
  "012F": "slow", // fuel level
  "0133": "slow", // baro
  "0146": "slow", // ambient
};

export interface SchedulerOptions {
  mediumMs?: number;
  slowMs?: number;
  /** Shared ref-counts of promoted ids, so promotions outlive one Scheduler (reconnects). */
  fast?: Map<string, number>;
  onSupported?: (ids: string[]) => void;
  onValue?: (id: string, value: number, t: number) => void;
  onWarning?: (text: string) => void;
}

const NO_DATA_DROP = 3;
const TIMEOUT_WARN = 5;
const HZ_WINDOW_MS = 2000;

/** Ref-counted add of ids to a map; the returned release undoes it once. */
export function addRefs(map: Map<string, number>, ids: string[]) {
  ids.forEach((id) => map.set(id, (map.get(id) ?? 0) + 1));
  let done = false;
  return () => {
    if (done) return;
    done = true;
    ids.forEach((id) => {
      const n = (map.get(id) ?? 1) - 1;
      if (n > 0) map.set(id, n);
      else map.delete(id);
    });
  };
}

/**
 * Priority polling over one ElmClient: fast items back-to-back (round-robin), medium/slow items whenever their
 * interval is due (most overdue first). Only polls what the car reports as supported. Waits while
 * usePollingPause holds > 0.
 */
export class Scheduler {
  private stopped = false;
  private wake: (() => void) | null = null;
  private items: string[] = [];
  private last = new Map<string, number>();
  private misses = new Map<string, number>();
  private timeouts = 0;
  private rr = 0;
  private done: number[] = [];
  private readonly fast: Map<string, number>;

  constructor(
    private client: Sender,
    private opts: SchedulerOptions = {},
  ) {
    this.fast = opts.fast ?? new Map();
  }

  /** Polls `ids` at fast priority until release() is called. */
  requestFast(ids: string[]) {
    return addRefs(this.fast, ids);
  }

  tier(id: string): Tier {
    return this.fast.has(id) ? "fast" : (TIERS[id] ?? "medium");
  }

  /** Completed reads per second over the last 2 s. */
  get hz() {
    const now = Date.now();
    this.done = this.done.filter((t) => t > now - HZ_WINDOW_MS);
    return this.done.length / (HZ_WINDOW_MS / 1000);
  }

  get polled() {
    return [...this.items];
  }

  /** Runs until stop() or a disconnect. */
  async run() {
    await this.waitWhilePaused();
    if (this.stopped) return;
    let supported = new Set<string>();
    try {
      supported = await discoverSupported(this.client);
    } catch (e) {
      if (e instanceof ElmError && e.code === "DISCONNECTED") return;
      this.opts.onWarning?.(`Couldn't read supported PIDs (${e instanceof ElmError ? e.code : String(e)})`);
    }
    this.items = [...PID_LIST.filter((p) => supported.has(p.id)).map((p) => p.id), ATRV.id];
    this.opts.onSupported?.(this.polled);

    while (!this.stopped) {
      await this.waitWhilePaused();
      if (this.stopped) break;
      const now = Date.now();
      const next = this.pick(now);
      if (typeof next === "number") {
        await this.sleep(next);
        continue;
      }
      this.last.set(next, now);
      try {
        const value = await this.read(next);
        const t = Date.now();
        this.misses.delete(next);
        this.timeouts = 0;
        this.done.push(t);
        this.opts.onValue?.(next, value, t);
      } catch (e) {
        if (!(e instanceof ElmError)) continue; // unexpected reply: skip this round
        if (e.code === "DISCONNECTED") break;
        if (e.code === "NO_DATA") {
          const n = (this.misses.get(next) ?? 0) + 1;
          this.misses.set(next, n);
          // Some ECUs advertise PIDs they never answer.
          if (n >= NO_DATA_DROP) this.items = this.items.filter((i) => i !== next);
        } else if (e.code === "TIMEOUT" && ++this.timeouts === TIMEOUT_WARN) {
          this.opts.onWarning?.("The adapter keeps timing out. Live values may be stale.");
        }
      }
    }
  }

  stop() {
    this.stopped = true;
    this.wake?.();
  }

  /** The next item id, or how many ms to wait when nothing is due and nothing is fast. */
  private pick(now: number): string | number {
    const interval = (id: string) => (this.tier(id) === "slow" ? (this.opts.slowMs ?? 30_000) : (this.opts.mediumMs ?? 3000));
    let due: string | null = null;
    let wait = Infinity;
    let overdue = -Infinity;
    const fast: string[] = [];
    for (const id of this.items) {
      if (this.tier(id) === "fast") {
        fast.push(id);
        continue;
      }
      const left = (this.last.get(id) ?? -Infinity) + interval(id) - now;
      if (left <= 0 && -left > overdue) {
        overdue = -left;
        due = id;
      } else if (left > 0) wait = Math.min(wait, left);
    }
    if (due) return due;
    if (fast.length) return fast[this.rr++ % fast.length]!;
    return Math.min(wait, 250);
  }

  private async read(id: string) {
    if (id !== ATRV.id) return readPid(this.client, id);
    const v = parseFloat((await this.client.send(ATRV.id))[0] ?? "");
    if (Number.isNaN(v)) throw new Error("ATRV: unexpected reply");
    return v;
  }

  private sleep(ms: number) {
    return new Promise<void>((r) => {
      const timer = setTimeout(() => ((this.wake = null), r()), ms);
      this.wake = () => (clearTimeout(timer), (this.wake = null), r());
    });
  }

  private waitWhilePaused() {
    if (usePollingPause.getState().holds <= 0) return Promise.resolve();
    return new Promise<void>((r) => {
      const finish = () => (unsub(), (this.wake = null), r());
      const unsub = usePollingPause.subscribe((s) => s.holds <= 0 && finish());
      this.wake = finish;
    });
  }
}
