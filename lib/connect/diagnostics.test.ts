import { afterEach, describe, expect, it, vi } from "vitest";
import { ElmClient, ElmError } from "../elm/ElmClient";
import { SimulatorTransport } from "../transport/SimulatorTransport";
import { EMPTY_OVERRIDES } from "../transport/uuidSettings";
import { NO_ANSWER, NOT_SUPPORTED, readAdapterInfo } from "./adapterInfo";
import { copyText, formatDiagnostics, LOG_LINES, type DiagnosticsInput } from "./diagnostics";

const T = Date.UTC(2026, 9, 16, 12, 0, 0);
const input: DiagnosticsInput = {
  now: T,
  mode: "ble",
  status: "connected",
  deviceName: "JF327",
  error: "",
  failure: null,
  vehicleError: "NO_DATA",
  info: { version: "ELM327 v1.5", description: "not supported", protocol: "A6 · ISO 15765-4 CAN (11 bit ID, 500 kbaud) (auto)", voltage: "12.4V" },
  gatt: [{ uuid: "0000fff0-0000-1000-8000-00805f9b34fb", characteristics: [{ uuid: "0000fff1-0000-1000-8000-00805f9b34fb", properties: ["notify"] }] }],
  selected: { notify: "0000fff1-0000-1000-8000-00805f9b34fb", write: "0000fff2-0000-1000-8000-00805f9b34fb" },
  writeMethod: "without-response",
  overrides: { ...EMPTY_OVERRIDES, notify: "fff1" },
  log: [
    { dir: "tx", text: "ATZ", t: T },
    { dir: "rx", text: "ELM327 v1.5\r\r>", t: T + 1500 },
  ],
};

describe("formatDiagnostics", () => {
  it("writes a readable summary followed by the debug lines", () => {
    expect(formatDiagnostics(input)).toBe(`OBD Dash connection diagnostics
Generated: 2026-10-16T12:00:00.000Z

Mode: ble
Status: connected
Device: JF327
Vehicle: NO_DATA

Adapter
  ELM version (ATI): ELM327 v1.5
  Description (AT@1): not supported
  Protocol (ATDPN): A6 · ISO 15765-4 CAN (11 bit ID, 500 kbaud) (auto)
  Voltage (ATRV): 12.4V

Bluetooth
  Notify characteristic: 0000fff1-0000-1000-8000-00805f9b34fb
  Write characteristic: 0000fff2-0000-1000-8000-00805f9b34fb
  Write method: without-response
  UUID overrides: notify=fff1
  GATT:
    service 0000fff0-0000-1000-8000-00805f9b34fb
      0000fff1-0000-1000-8000-00805f9b34fb [notify]

Last 50 debug lines (UTC; ␍ = CR, ␊ = LF)
12:00:00.000 → ATZ
12:00:01.500 ← ELM327 v1.5␍␍>
`);
  });

  it("keeps only the last 50 log lines", () => {
    const log = Array.from({ length: 80 }, (_, n) => ({ dir: "info" as const, text: `line ${n}`, t: T }));
    const lines = formatDiagnostics({ ...input, log }).split("\n").filter((l) => l.includes(" · line "));
    expect(lines).toHaveLength(LOG_LINES);
    expect(lines[0]).toContain("line 30");
    expect(lines.at(-1)).toContain("line 79");
  });

  it("shows a failed connect and an empty state without crashing", () => {
    const text = formatDiagnostics({
      ...input,
      status: "error",
      mode: null,
      error: "User cancelled",
      failure: { name: "NotFoundError", afterTransport: false },
      info: null,
      gatt: [],
      selected: null,
      writeMethod: null,
      overrides: EMPTY_OVERRIDES,
      vehicleError: null,
      log: [],
    });
    expect(text).toContain("Mode: -");
    expect(text).toContain("Error: User cancelled");
    expect(text).toContain("Failure: NotFoundError (before the Bluetooth link came up)");
    expect(text).toContain("UUID overrides: none (auto-pick)");
    expect(text).toContain("(none discovered)");
    expect(text).toContain("(empty)");
  });
});

describe("copyText", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("writes to the clipboard when there is one", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyText("hi")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hi");
  });

  it("returns false when the clipboard is missing or refuses", async () => {
    vi.stubGlobal("navigator", {});
    expect(await copyText("hi")).toBe(false);
    vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.reject(new Error("denied")) } });
    expect(await copyText("hi")).toBe(false);
  });
});

describe("readAdapterInfo", () => {
  it("reads ATI, AT@1, ATDPN and ATRV from the simulator", async () => {
    const client = new ElmClient(new SimulatorTransport({ delayMs: 0, seed: 1 }));
    await client.connect();
    const info = await readAdapterInfo(client);
    expect(info.version).toBe("ELM327 v1.5");
    expect(info.description).toBe("OBDII to RS232 Interpreter");
    expect(info.protocol).toBe("A6 · ISO 15765-4 CAN (11 bit ID, 500 kbaud) (auto)");
    expect(info.voltage).toMatch(/^\d+\.\dV$/);
  });

  it("shows a '?' answer as not supported and a silent adapter as no answer", async () => {
    const answers: Record<string, () => string[]> = {
      ATI: () => ["ELM327 v2.1"],
      "AT@1": () => {
        throw new ElmError("UNKNOWN_COMMAND", "AT@1", "?");
      },
      ATDPN: () => {
        throw new ElmError("TIMEOUT", "ATDPN");
      },
      ATRV: () => ["12.1V"],
    };
    const client = { send: async (cmd: string) => answers[cmd]!() } as unknown as ElmClient;
    expect(await readAdapterInfo(client)).toEqual({ version: "ELM327 v2.1", description: NOT_SUPPORTED, protocol: NO_ANSWER, voltage: "12.1V" });
  });
});
