import { ElmError } from "../elm/ElmClient";
import { readCustomGroup, type CustomPid } from "../obd/custom";
import { cmdOf, PID_LIST } from "../obd/pids";
import { readCmd } from "../obd/requests";
import { discoverSupported } from "../obd/supported";
import { ATRV } from "../store/live";
import { pollingSettled, trackPolling, usePollingPause } from "./pause";

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
  // Counters, status and identity PIDs barely change.
  ...Object.fromEntries(
    ["0103", "0113", "011C", "011D", "0121", "0130", "0131", "014D", "014E", "0151", "0152", "0163"].map((id): [string, Tier] => [id, "slow"]),
  ),
};

export interface SchedulerOptions {
  mediumMs?: number;
  slowMs?: number;
  /** Shared ref-counts of promoted ids, so promotions outlive one Scheduler (reconnects). */
  fast?: Map<string, number>;
  onSupported?: (ids: string[]) => void;
  onValue?: (id: string, value: number, t: number) => void;
  onWarning?: (text: string) => void;
  /** The user's custom PIDs (lib/obd/custom.ts); only enabled ones are polled. Update with setCustom(). */
  custom?: CustomPid[];
  /** ATDPN answer, for the default header custom PIDs restore after an ATSH. */
  protocol?: string;
}

const NO_DATA_DROP = 3;
// Second entries of a shared command (O2 trim): read together with their first entry, never requested themselves.
const PIDS_WITH_CMD = new Set(PID_LIST.filter((p) => p.cmd).map((p) => p.id));
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
  private items: string[] = []; // one id per request: registry PIDs (first entry of a shared command), ATRV, custom PIDs
  private standard: string[] = [];
  private reported: string[] = [];
  private started = false;
  private custom = new Map<string, CustomPid>();
  private dropped = new Set<string>();
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
    this.setCustom(opts.custom ?? []);
  }

  /** Swaps the custom PID definitions without restarting. Edited ones get a fresh chance after being dropped. */
  setCustom(defs: CustomPid[]) {
    const old = this.custom;
    this.custom = new Map(defs.filter((d) => d.enabled).map((d) => [d.id, d]));
    for (const [id, d] of this.custom) {
      if (old.get(id) === d) continue;
      this.misses.delete(id);
      this.dropped.delete(id);
    }
    if (!this.started) return;
    const customIds = [...this.custom.keys()];
    this.items = [...this.items.filter((i) => !old.has(i)), ...customIds.filter((i) => !this.dropped.has(i))];
    this.reported = [...this.standard, ...customIds];
    this.opts.onSupported?.(this.supported);
  }

  /** Polls `ids` at fast priority until release() is called. */
  requestFast(ids: string[]) {
    return addRefs(this.fast, ids);
  }

  tier(id: string): Tier {
    return this.fast.has(id) ? "fast" : (TIERS[id] ?? this.custom.get(id)?.tier ?? "medium");
  }

  /** Completed reads per second over the last 2 s. */
  get hz() {
    const now = Date.now();
    this.done = this.done.filter((t) => t > now - HZ_WINDOW_MS);
    return this.done.length / (HZ_WINDOW_MS / 1000);
  }

  /** What is requested: one id per command. */
  get polled() {
    return [...this.items];
  }

  /** Every live id this session can produce (both entries of a shared command, custom PIDs). */
  get supported() {
    return [...this.reported];
  }

  /** Runs until stop() or a disconnect. */
  async run() {
    await pollingSettled(); // a previous Scheduler's header group (stop + restart) must restore before 0100
    await this.waitWhilePaused();
    if (this.stopped) return;
    let supported = new Set<string>();
    try {
      supported = await discoverSupported(this.client);
    } catch (e) {
      if (e instanceof ElmError && e.code === "DISCONNECTED") return;
      this.opts.onWarning?.(`Couldn't read supported PIDs (${e instanceof ElmError ? e.code : String(e)})`);
    }
    this.standard = [...PID_LIST.filter((p) => supported.has(cmdOf(p))).map((p) => p.id), ATRV.id];
    this.items = this.standard.filter((id) => !PIDS_WITH_CMD.has(id));
    this.started = true;
    this.setCustom([...this.custom.values()]);

    while (!this.stopped) {
      await this.waitWhilePaused();
      if (this.stopped) break;
      // No await between this check and the group starting, so a pause can't begin in between and miss it.
      if (usePollingPause.getState().holds > 0) continue;
      const now = Date.now();
      const next = this.pick(now);
      if (typeof next === "number") {
        await this.sleep(next);
        continue;
      }
      this.last.set(next, now);
      const custom = this.custom.get(next);
      if (custom) {
        if (await trackPolling(this.pollCustom(custom, now))) break;
        continue;
      }
      try {
        this.ok(next, await this.read(next));
      } catch (e) {
        if (this.fail(next, e)) break;
      }
    }
  }

  /**
   * Reads a custom PID together with every other due (or fast) custom PID behind the same header, so the ATSH
   * switch and restore happen once per group. Returns true on a disconnect.
   */
  private async pollCustom(first: CustomPid, now: number) {
    const group = [first];
    for (const id of this.items) {
      const c = this.custom.get(id);
      if (c && c !== first && c.header === first.header && (this.tier(id) === "fast" || this.left(id, now) <= 0)) group.push(c);
    }
    group.forEach((c) => this.last.set(c.id, now));
    let results;
    try {
      results = await readCustomGroup(this.client, first.header, group, this.opts.protocol ?? "");
    } catch (e) {
      return group.map((c) => this.fail(c.id, e)).some(Boolean);
    }
    for (const r of results) {
      if ("error" in r) this.fail(r.id, r.error);
      else this.ok(r.id, [[r.id, r.value]]);
    }
    return false;
  }

  private ok(id: string, values: [string, number][]) {
    const t = Date.now();
    this.misses.delete(id);
    this.timeouts = 0;
    this.done.push(t);
    for (const [i, v] of values) this.opts.onValue?.(i, v, t);
  }

  /** Counts a failed read; true when the adapter is gone. */
  private fail(id: string, e: unknown): boolean {
    const code = e instanceof ElmError ? e.code : null;
    if (code === "DISCONNECTED") return true;
    if (code === "TIMEOUT" && ++this.timeouts === TIMEOUT_WARN) this.opts.onWarning?.("The adapter keeps timing out. Live values may be stale.");
    const custom = this.custom.get(id);
    // Some ECUs advertise PIDs they never answer. A custom PID is dropped for any repeated failure ("?", bad
    // reply, formula error) so a wrong definition can't keep slowing down standard polling.
    if (code !== "NO_DATA" && !custom) return false; // unexpected standard reply: skip this round
    const n = (this.misses.get(id) ?? 0) + 1;
    this.misses.set(id, n);
    if (n < NO_DATA_DROP) return false;
    this.items = this.items.filter((i) => i !== id);
    if (custom) {
      this.dropped.add(id);
      this.opts.onWarning?.(`Custom PID "${custom.name}" stopped for this session: ${e instanceof Error ? e.message : String(e)}`);
    }
    return false;
  }

  stop() {
    this.stopped = true;
    this.wake?.();
  }

  /** The next item id, or how many ms to wait when nothing is due and nothing is fast. */
  private pick(now: number): string | number {
    let due: string | null = null;
    let wait = Infinity;
    let overdue = -Infinity;
    const fast: string[] = [];
    for (const id of this.items) {
      if (this.tier(id) === "fast") {
        fast.push(id);
        continue;
      }
      const left = this.left(id, now);
      if (left <= 0 && -left > overdue) {
        overdue = -left;
        due = id;
      } else if (left > 0) wait = Math.min(wait, left);
    }
    if (due) return due;
    if (fast.length) return fast[this.rr++ % fast.length]!;
    return Math.min(wait, 250);
  }

  /** ms until a medium/slow item is due (≤ 0: due now). */
  private left(id: string, now: number) {
    const interval = this.tier(id) === "slow" ? (this.opts.slowMs ?? 30_000) : (this.opts.mediumMs ?? 3000);
    return (this.last.get(id) ?? -Infinity) + interval - now;
  }

  private async read(id: string): Promise<[string, number][]> {
    if (id !== ATRV.id) return readCmd(this.client, id);
    const v = parseFloat((await this.client.send(ATRV.id))[0] ?? "");
    if (Number.isNaN(v)) throw new Error("ATRV: unexpected reply");
    return [[id, v]];
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
