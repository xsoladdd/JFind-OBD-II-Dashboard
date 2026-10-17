import { describe, expect, it, vi } from "vitest";
import { Emitter, type Transport } from "../transport/types";
import { cleanResponse, ElmClient, ElmError } from "./ElmClient";

/** A transport whose replies the test pushes by hand, chunk by chunk. */
class FakeTransport implements Transport {
  written: string[] = [];
  private data = new Emitter<[string]>();
  private dropped = new Emitter<[]>();
  async connect() {}
  async disconnect() {}
  async write(t: string) {
    this.written.push(t);
  }
  onData(cb: (c: string) => void) {
    return this.data.on(cb);
  }
  onDisconnect(cb: () => void) {
    return this.dropped.on(cb);
  }
  push(...chunks: string[]) {
    chunks.forEach((c) => this.data.emit(c));
  }
  drop() {
    this.dropped.emit();
  }
}

async function open() {
  const t = new FakeTransport();
  const c = new ElmClient(t);
  // connect() runs init; answer it so the client ends up open
  const init = c.connect();
  for (const reply of ["ELM327 v1.5\r\r>", "OK\r\r>", "OK\r\r>", "OK\r\r>", "OK\r\r>", "OK\r\r>", "OK\r\r>", "4100BE3EB811\r\r>", "A6\r\r>"]) {
    await vi.waitFor(() => expect(t.written.length).toBeGreaterThan(0));
    t.written.length = 0;
    t.push(reply);
  }
  const info = await init;
  return { t, c, info };
}

describe("cleanResponse", () => {
  it("drops echo, SEARCHING and blank lines", () => {
    expect(cleanResponse("010C\r\nSEARCHING...\r\n41 0C 1A F8\r\n\r\n", "010C")).toEqual(["41 0C 1A F8"]);
  });
  it("keeps every line of a multi-line reply", () => {
    expect(cleanResponse("014\r0:490201534D49\r1:4D554C41544F52\r2:30564E30303031\r\r", "0902")).toHaveLength(4);
  });
  it("strips BUS INIT OK and control bytes", () => {
    expect(cleanResponse("BUS INIT: ...OK\r\x0041 00 BE 3E B8 11\r", "0100")).toEqual(["41 00 BE 3E B8 11"]);
  });
  it.each([
    ["NO DATA", "NO_DATA"],
    ["SEARCHING...\rUNABLE TO CONNECT", "UNABLE_TO_CONNECT"],
    ["BUS INIT: ...ERROR", "BUS_INIT"],
    ["?", "UNKNOWN_COMMAND"],
    ["STOPPED", "STOPPED"],
    ["CAN ERROR", "CAN_ERROR"],
    ["BUFFER FULL", "ADAPTER_ERROR"],
  ])("maps %j to %s", (raw, code) => {
    expect(() => cleanResponse(`${raw}\r\r`, "0100")).toThrow(expect.objectContaining({ code }));
  });
});

describe("ElmClient", () => {
  it("runs the init sequence in order and records the protocol", async () => {
    const t = new FakeTransport();
    const c = new ElmClient(t);
    const init = c.connect();
    const sent: string[] = [];
    for (const reply of ["\r\rELM327 v1.5\r\r>", ...Array(6).fill("OK\r\r>"), "SEARCHING...\r4100BE3EB811\r\r>", "A6\r\r>"]) {
      await vi.waitFor(() => expect(t.written.length).toBe(1));
      sent.push(t.written.pop()!.trim());
      t.push(reply);
    }
    expect(sent).toEqual(["ATZ", "ATE0", "ATL0", "ATS0", "ATH0", "ATAT1", "ATSP0", "0100", "ATDPN"]);
    expect(await init).toEqual({ elmVersion: "ELM327 v1.5", protocol: "A6", vehicleError: undefined });
  });

  it("still connects when the car does not answer 0100", async () => {
    const t = new FakeTransport();
    const c = new ElmClient(t);
    const init = c.connect();
    for (const reply of ["ELM327 v1.5\r\r>", ...Array(6).fill("OK\r\r>"), "SEARCHING...\rUNABLE TO CONNECT\r\r>"]) {
      await vi.waitFor(() => expect(t.written.length).toBe(1));
      t.written.pop();
      t.push(reply);
    }
    expect(await init).toMatchObject({ protocol: "", vehicleError: "UNABLE_TO_CONNECT" });
  });

  it("assembles a reply split across many chunks, including the prompt", async () => {
    const { t, c } = await open();
    const p = c.send("010C");
    await vi.waitFor(() => expect(t.written).toEqual(["010C\r"]));
    t.push("01", "0C\r4", "1 0C", " 1A F", "8\r", "\r", ">");
    expect(await p).toEqual(["41 0C 1A F8"]);
  });

  it("keeps commands strictly serial", async () => {
    const { t, c } = await open();
    const a = c.send("010C");
    const b = c.send("010D");
    await vi.waitFor(() => expect(t.written).toEqual(["010C\r"]));
    t.push("410C1AF8\r\r>");
    expect(await a).toEqual(["410C1AF8"]);
    await vi.waitFor(() => expect(t.written).toEqual(["010C\r", "010D\r"]));
    t.push("410D32\r\r>");
    expect(await b).toEqual(["410D32"]);
  });

  it("rejects with a typed error for NO DATA and keeps working", async () => {
    const { t, c } = await open();
    const p = c.send("0160");
    await vi.waitFor(() => expect(t.written.length).toBe(1));
    t.push("NO DA", "TA\r\r>");
    await expect(p).rejects.toMatchObject({ code: "NO_DATA" });
    const q = c.send("ATRV");
    await vi.waitFor(() => expect(t.written.length).toBe(2));
    t.push("12.6V\r\r>");
    expect(await q).toEqual(["12.6V"]);
  });

  it("times out when no prompt arrives", async () => {
    const { t, c } = await open();
    const p = c.send("010C", { timeoutMs: 20 });
    t.push("41 0C");
    await expect(p).rejects.toBeInstanceOf(ElmError);
    await expect(p).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("rejects in-flight and queued commands on disconnect", async () => {
    const { c } = await open();
    const a = c.send("010C");
    const b = c.send("010D");
    await c.disconnect();
    await expect(a).rejects.toMatchObject({ code: "DISCONNECTED" });
    await expect(b).rejects.toMatchObject({ code: "DISCONNECTED" });
  });

  it("gives up and reports disconnected when the transport cannot reconnect", async () => {
    const { t, c } = await open();
    const statuses: string[] = [];
    c.onStatus((s) => statuses.push(s));
    const p = c.send("010C");
    t.drop();
    await expect(p).rejects.toMatchObject({ code: "DISCONNECTED" });
    await vi.waitFor(() => expect(statuses).toEqual(["disconnected"]));
  });
});
