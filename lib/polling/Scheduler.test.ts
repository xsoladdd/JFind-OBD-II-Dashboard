import { afterEach, describe, expect, it } from "vitest";
import { ElmClient } from "../elm/ElmClient";
import type { CustomPid } from "../obd/custom";
import { SimulatorTransport } from "../transport/SimulatorTransport";
import { usePollingPause, withPollingPaused } from "./pause";
import { Scheduler, TIERS } from "./Scheduler";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const custom = (id: string, over: Partial<CustomPid> = {}): CustomPid => ({
  id, name: id, unit: "", request: "221234", header: "7E0", prefix: "", formula: "A*256+B",
  min: 0, max: 65535, gauge: "number", tier: "medium", enabled: true, ...over,
});

async function setup(unsupported: number[] = [], defs: CustomPid[] = []) {
  const client = new ElmClient(new SimulatorTransport({ chunkSize: 20, delayMs: 0, seed: 3, unsupported }));
  await client.connect();
  const sent: string[] = [];
  client.onTraffic((e) => e.dir === "tx" && sent.push(e.text));
  const values: string[] = [];
  const warnings: string[] = [];
  const scheduler = new Scheduler(client, {
    mediumMs: 60,
    slowMs: 250,
    custom: defs,
    protocol: "A6",
    onValue: (id) => values.push(id),
    onWarning: (w) => warnings.push(w),
  });
  const count = (id: string) => values.filter((v) => v === id).length;
  return { client, scheduler, sent, values, count, warnings };
}

let running: Scheduler | null = null;
afterEach(() => {
  running?.stop();
  usePollingPause.setState({ holds: 0 });
});

describe("Scheduler", () => {
  it("polls fast PIDs most, still serves medium and slow ones, and never polls unsupported PIDs", async () => {
    const { scheduler, sent, count } = await setup([0x10, 0x33]); // no MAF (medium), no baro (slow)
    running = scheduler;
    void scheduler.run();
    await wait(700);
    scheduler.stop();

    expect(sent).not.toContain("0110");
    expect(sent).not.toContain("0133");
    expect(scheduler.polled).not.toContain("0110");

    const fast = Object.keys(TIERS).filter((id) => TIERS[id] === "fast");
    const others = scheduler.polled.filter((id) => !fast.includes(id));
    const minFast = Math.min(...fast.map(count));
    const maxOther = Math.max(...others.map(count));
    expect(minFast).toBeGreaterThan(maxOther);
    for (const id of others) expect(count(id)).toBeGreaterThanOrEqual(1); // medium and slow (incl. ATRV) all served
    expect(count("0105")).toBeGreaterThan(count("012F")); // medium beats slow
  });

  it("pauses while a hold is active and resumes after", async () => {
    const { scheduler, values } = await setup();
    running = scheduler;
    void scheduler.run();
    await wait(150);
    let during = 0;
    await withPollingPaused(async () => {
      await wait(20); // let the in-flight read finish
      during = values.length;
      await wait(200);
      expect(values.length).toBe(during);
    });
    await wait(150);
    expect(values.length).toBeGreaterThan(during);
  });

  it("requestFast promotes a PID until released", async () => {
    const { scheduler } = await setup();
    const release = scheduler.requestFast(["0105"]);
    expect(scheduler.tier("0105")).toBe("fast");
    release();
    release(); // idempotent
    expect(scheduler.tier("0105")).toBe("medium");
  });

  it("reads both values of a two-value PID from one request", async () => {
    const { scheduler, sent, count } = await setup();
    running = scheduler;
    void scheduler.run();
    await wait(400);
    scheduler.stop();
    expect(sent).not.toContain("0114T");
    expect(scheduler.supported).toContain("0114T");
    expect(count("0114T")).toBeGreaterThan(0);
    expect(count("0114T")).toBe(count("0114"));
    expect(sent.filter((c) => c === "0114").length).toBe(count("0114"));
  });

  it("polls custom PIDs, grouped by header, and always restores the default header", async () => {
    const defs = [custom("c-a"), custom("c-b", { request: "225678", formula: "A" }), custom("c-c", { header: "", request: "225678", formula: "A" })];
    const { scheduler, sent, count } = await setup([], defs);
    running = scheduler;
    void scheduler.run();
    await wait(500);
    scheduler.stop();
    expect(scheduler.supported).toEqual(expect.arrayContaining(["c-a", "c-b", "c-c"]));
    for (const id of ["c-a", "c-b", "c-c"]) expect(count(id)).toBeGreaterThan(0);
    const switches = sent.flatMap((c, i) => (c === "ATSH7E0" ? [i] : []));
    expect(switches.length).toBeGreaterThan(0);
    for (const i of switches) expect(sent.slice(i + 1, i + 4)).toEqual(["221234", "225678", "ATSH7DF"]); // one switch per group
    expect(switches.length).toBe(count("c-a"));
    expect(sent.filter((c) => c === "ATSH7DF").length).toBe(switches.length);
  });

  it("drops a custom PID that keeps failing, and standard polling carries on", async () => {
    // Header 123 isn't answered by the simulator (NO DATA); 229999 gets a negative response.
    const defs = [custom("c-nodata", { header: "123", tier: "fast" }), custom("c-refused", { header: "", request: "229999", tier: "fast" })];
    const { scheduler, sent, count, warnings } = await setup([], defs);
    running = scheduler;
    void scheduler.run();
    await wait(300);
    const before = count("010C");
    await wait(200);
    scheduler.stop();
    expect(sent.filter((c) => c === "ATSH123")).toHaveLength(3);
    expect(sent.filter((c) => c === "229999")).toHaveLength(3);
    expect(scheduler.polled).not.toContain("c-nodata");
    expect(scheduler.polled).not.toContain("c-refused");
    expect(warnings.filter((w) => w.startsWith("Custom PID"))).toHaveLength(2);
    expect(count("010C")).toBeGreaterThan(before);
  });

  it("setCustom swaps definitions while running and retries an edited, dropped one", async () => {
    const { scheduler, count, sent } = await setup([], [custom("c-x", { header: "123", tier: "fast" })]);
    running = scheduler;
    void scheduler.run();
    await wait(200);
    expect(scheduler.polled).not.toContain("c-x");
    scheduler.setCustom([custom("c-x", { tier: "fast" })]); // fixed header
    await wait(200);
    expect(count("c-x")).toBeGreaterThan(0);
    scheduler.setCustom([custom("c-x", { enabled: false })]);
    expect(scheduler.polled).not.toContain("c-x");
    expect(scheduler.supported).not.toContain("c-x");
    scheduler.stop();
    expect(sent.at(-1)).not.toBe("ATSH7E0");
  });
});
