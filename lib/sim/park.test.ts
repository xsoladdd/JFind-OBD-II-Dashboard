import { afterEach, describe, expect, it } from "vitest";
import { isDriving } from "../drive/driving";
import { ElmClient } from "../elm/ElmClient";
import { readPid } from "../obd/requests";
import { SimulatorTransport } from "../transport/SimulatorTransport";
import { setSimParked } from "./park";

describe("Demo hold parked", () => {
  afterEach(() => setSimParked(false));

  it("stops the cruising demo car, which unlocks StoppedOnly, and lets it drive on when released", async () => {
    const t = 30; // mid-cruise in the 60 s demo cycle (lib/sim/engine.ts)
    const client = new ElmClient(new SimulatorTransport({ delayMs: 0, seed: 1, clock: () => t }));
    await client.connect();
    const moving = await readPid(client, "010D");
    expect(isDriving("connected", moving)).toBe(true);

    setSimParked(true);
    const parked = await readPid(client, "010D");
    expect(parked).toBe(0);
    expect(isDriving("connected", parked)).toBe(false);
    expect(await readPid(client, "010C")).toBeGreaterThan(0); // still idling

    setSimParked(false);
    expect(await readPid(client, "010D")).toBeGreaterThan(0);
  });
});
