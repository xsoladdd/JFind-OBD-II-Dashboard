import { afterEach, describe, expect, it } from "vitest";
import { ElmClient } from "../elm/ElmClient";
import { SimulatorTransport } from "../transport/SimulatorTransport";
import { usePollingPause, withPollingPaused } from "./pause";
import { Scheduler, TIERS } from "./Scheduler";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function setup(unsupported: number[] = []) {
  const client = new ElmClient(new SimulatorTransport({ chunkSize: 20, delayMs: 0, seed: 3, unsupported }));
  await client.connect();
  const sent: string[] = [];
  client.onTraffic((e) => e.dir === "tx" && sent.push(e.text));
  const values: string[] = [];
  const scheduler = new Scheduler(client, { mediumMs: 60, slowMs: 250, onValue: (id) => values.push(id) });
  const count = (id: string) => values.filter((v) => v === id).length;
  return { client, scheduler, sent, values, count };
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
});
