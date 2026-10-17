import { describe, expect, it } from "vitest";
import { ElmClient, ElmError } from "../elm/ElmClient";
import { SimulatorTransport } from "../transport/SimulatorTransport";
import { decodeCustom, defaultHeader, defaultPrefix, matchReply, readCustomGroup, sanitizeCustomPids, testCustomPid, validateCustomPid, withHeader, type CustomPid } from "./custom";

const customPid = (over: Partial<CustomPid> = {}): CustomPid => ({
  id: "c-test",
  name: "Demo temperature",
  unit: "°C",
  request: "221234",
  header: "7E0",
  prefix: "",
  formula: "(A*256+B)/10-40",
  min: -40,
  max: 200,
  gauge: "number",
  tier: "medium",
  enabled: true,
  ...over,
});

async function sim() {
  const client = new ElmClient(new SimulatorTransport({ chunkSize: 20, delayMs: 0, seed: 5 }));
  await client.connect();
  const sent: string[] = [];
  client.onTraffic((e) => e.dir === "tx" && sent.push(e.text));
  return { client, sent };
}

/** A scripted adapter: replies by command, recording everything sent. */
function fake(replies: Record<string, string[] | ElmError>) {
  const sent: string[] = [];
  return {
    sent,
    send: async (cmd: string) => {
      sent.push(cmd);
      const r = replies[cmd] ?? ["OK"];
      if (r instanceof ElmError) throw r;
      return r;
    },
  };
}

describe("response prefix", () => {
  it.each([
    ["221234", "621234"],
    ["2101", "6101"],
    ["010C", "410C"],
    ["03", "43"],
    ["22F190", "62F190"],
  ])("%s → %s", (req, prefix) => expect(defaultPrefix(req)).toBe(prefix));

  it("returns the data bytes after the prefix, skipping other messages", () => {
    expect(matchReply(["62 12 34 03 E8"], "621234")).toEqual([0x03, 0xe8]);
    expect(matchReply(["7F 22 78", "62 12 34 01"], "621234")).toEqual([0x01]); // "response pending", then the answer
    expect(matchReply(["62 12 35 09", "621234AA"], "621234")).toEqual([0xaa]);
  });

  it("reassembles a multi-frame reply", () => {
    expect(matchReply(["00A", "0: 62 12 34 01 02 03", "1: 04 05 06 07"], "621234")).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("explains a negative response and a wrong reply", () => {
    expect(() => matchReply(["7F 22 31"], "621234")).toThrow("ECU refused the request (negative response 7F, code 0x31)");
    expect(() => matchReply(["62 99 99 01"], "621234")).toThrow("Reply doesn't start with 621234");
  });

  it("decodes with a custom prefix", () => {
    expect(decodeCustom(customPid({ prefix: "6212", formula: "A" }), ["62 12 34 05"])).toBe(0x34);
  });
});

describe("definitions", () => {
  it("validates", () => {
    expect(validateCustomPid(customPid())).toBeNull();
    expect(validateCustomPid(customPid({ name: " " }))).toMatch("name");
    expect(validateCustomPid(customPid({ request: "22123" }))).toMatch("Request");
    expect(validateCustomPid(customPid({ header: "7E" }))).toMatch("Header");
    expect(validateCustomPid(customPid({ header: "18DA10F1" }))).toMatch("Header");
    expect(validateCustomPid(customPid({ prefix: "62G" }))).toMatch("prefix");
    expect(validateCustomPid(customPid({ min: 5, max: 5 }))).toMatch("Max");
    expect(validateCustomPid(customPid({ formula: "A**2" }))).toMatch("Formula:");
  });

  it("sanitizes untrusted JSON", () => {
    const out = sanitizeCustomPids([
      { id: "a", name: "One", request: "22 12 34", header: "7e0", formula: "A", min: 0, max: 10, gauge: "dial", tier: "slow" },
      { id: "a", request: "2101", gauge: "rocket", tier: "turbo", min: "x", enabled: false }, // duplicate id
      { name: "no request" },
      null,
      "junk",
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: "a", request: "221234", header: "7E0", gauge: "dial", tier: "slow", enabled: true });
    expect(out[1]).toMatchObject({ request: "2101", name: "2101", gauge: "number", tier: "medium", min: 0, max: 255, enabled: false });
    expect(out[1]!.id).not.toBe("a");
    expect(sanitizeCustomPids({ not: "a list" })).toEqual([]);
  });
});

describe("headers", () => {
  it("restores the functional address of the active protocol", () => {
    expect(defaultHeader("A6")).toBe("7DF");
    expect(defaultHeader("8")).toBe("7DF");
    expect(defaultHeader("A7")).toBe("DB33F1");
    expect(defaultHeader("3")).toBeNull();
  });

  it("sets ATSH, reads, and restores the default through the simulator", async () => {
    const { client, sent } = await sim();
    const r = await testCustomPid(client, customPid(), "A6");
    expect(sent).toEqual(["ATSH7E0", "221234", "ATSH7DF"]);
    expect(r.error).toBeUndefined();
    expect(r.lines[0]).toMatch(/^62 ?12 ?34/);
    expect(r.value).toBeGreaterThan(-40);
    expect(await client.send("010D")).toHaveLength(1); // standard PIDs still answered after the restore
  });

  it("without the header the demo DID isn't answered, and no ATSH is sent", async () => {
    const { client, sent } = await sim();
    const r = await testCustomPid(client, customPid({ header: "" }), "A6");
    expect(sent).toEqual(["221234"]);
    expect(r.error).toMatch("code 0x31");
  });

  it("restores after a timeout, and rethrows the timeout", async () => {
    const a = fake({ "221234": new ElmError("TIMEOUT", "221234") });
    await expect(withHeader(a, "7E0", "A6", () => a.send("221234"))).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(a.sent).toEqual(["ATSH7E0", "221234", "ATSH7DF"]);
  });

  it("restores when the adapter rejects the ATSH", async () => {
    const a = fake({ ATSH7E0: new ElmError("UNKNOWN_COMMAND", "ATSH7E0", "?") });
    const r = await testCustomPid(a, customPid(), "A6");
    expect(a.sent).toEqual(["ATSH7E0", "ATSH7DF"]);
    expect(r.error).toMatch("UNKNOWN_COMMAND");
    expect(r.lines).toEqual(["?"]);
  });

  it("refuses headers off CAN or of the wrong width, sending nothing", async () => {
    const a = fake({});
    await expect(withHeader(a, "7E0", "A3", async () => 1)).rejects.toThrow("CAN");
    await expect(withHeader(a, "DA10F1", "A6", async () => 1)).rejects.toThrow("11-bit");
    expect(a.sent).toEqual([]);
    expect(await withHeader(a, "", "A3", async () => 1)).toBe(1); // header-less custom PIDs work on any protocol
  });

  it("reads a group under one header switch, keeping per-PID errors", async () => {
    const { client, sent } = await sim();
    const group = [customPid(), customPid({ id: "c-2", request: "225678", formula: "A*100/255" }), customPid({ id: "c-3", request: "229999" })];
    const r = await readCustomGroup(client, "7E0", group, "A6");
    expect(sent).toEqual(["ATSH7E0", "221234", "225678", "229999", "ATSH7DF"]);
    expect(r.map((x) => ("value" in x ? "ok" : "error"))).toEqual(["ok", "ok", "error"]);
  });
});
