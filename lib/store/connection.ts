import { create } from "zustand";
import { ElmClient, ElmError, type ElmErrorCode, type TrafficEvent } from "../elm/ElmClient";
import { parseMessages } from "../obd/parse";
import { PIDS } from "../obd/pids";
import { SimulatorTransport } from "../transport/SimulatorTransport";
import { loadOverrides } from "../transport/uuidSettings";
import { WebBluetoothTransport, type GattServiceInfo } from "../transport/WebBluetoothTransport";

export type ConnStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";
export type LogLine = TrafficEvent & { id: number };

/** Why the last connect() failed, kept structured so the troubleshooting guide doesn't parse message text. */
export interface ConnectFailure {
  /** Error name, e.g. "NotFoundError" (chooser cancelled), "NetworkError" (GATT) or "NoCharacteristicError". */
  name: string;
  code?: ElmErrorCode;
  command?: string;
  /** True when the Bluetooth link was up and the failure came later, during the ELM init. */
  afterTransport: boolean;
}

const LOG_LIMIT = 500;

interface ConnectionState {
  status: ConnStatus;
  mode: "ble" | "demo" | null;
  deviceName: string;
  elmVersion: string;
  protocol: string;
  vehicleError: ElmErrorCode | null;
  voltage: string;
  error: string;
  failure: ConnectFailure | null;
  log: LogLine[];
  gatt: GattServiceInfo[];
  selected: { notify: string; write: string } | null;
  /** How writes go out on the real adapter (null in Demo mode or before the characteristics are chosen). */
  writeMethod: "with-response" | "without-response" | null;
  connect: (mode: "ble" | "demo") => Promise<void>;
  disconnect: () => Promise<void>;
  sendRaw: (cmd: string) => Promise<void>;
  refreshVoltage: () => Promise<void>;
  clearLog: () => void;
}

// The live client stays outside React state; later phases (diagnostics, scheduler) share it via getClient().
let client: ElmClient | null = null;
let logId = 0;
export const getClient = () => client;

/** " (Engine RPM: 762 rpm)" when a raw reply is a registry PID, so the terminal is readable. */
function decodeHint(cmd: string, lines: string[]): string {
  const def = PIDS[cmd.toUpperCase()];
  if (!def) return "";
  try {
    const msg = parseMessages(lines).find((m) => m[0] === 0x41 && m[1] === parseInt(cmd.slice(2), 16));
    if (!msg) return "";
    return ` (${def.name}: ${+def.decode(msg.slice(2)).toFixed(2)} ${def.unit})`;
  } catch {
    return "";
  }
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const useConnection = create<ConnectionState>((set, get) => {
  const append = (e: TrafficEvent) =>
    set((s) => ({ log: [...s.log.slice(-(LOG_LIMIT - 1)), { ...e, id: logId++ }] }));

  return {
    status: "idle",
    mode: null,
    deviceName: "",
    elmVersion: "",
    protocol: "",
    vehicleError: null,
    voltage: "",
    error: "",
    failure: null,
    log: [],
    gatt: [],
    selected: null,
    writeMethod: null,

    async connect(mode) {
      if (client) await get().disconnect();
      const transport = mode === "demo" ? new SimulatorTransport() : new WebBluetoothTransport(loadOverrides());
      const c = new ElmClient(transport);
      client = c;
      c.onTraffic(append);
      c.onStatus((s, info) => {
        if (client !== c) return;
        if (s === "reconnecting") set({ status: "reconnecting" });
        else if (s === "connected" && info)
          set({ status: "connected", elmVersion: info.elmVersion, protocol: info.protocol, vehicleError: info.vehicleError ?? null });
        else if (s === "disconnected") set({ status: "idle", voltage: "" });
      });
      set({ status: "connecting", mode, error: "", failure: null, vehicleError: null, protocol: "", elmVersion: "", voltage: "", gatt: [], selected: null, writeMethod: null });
      try {
        const info = await c.connect();
        if (client !== c) return; // superseded by another connect/disconnect while initialising
        set({
          status: "connected",
          elmVersion: info.elmVersion,
          protocol: info.protocol,
          vehicleError: info.vehicleError ?? null,
        });
        void get().refreshVoltage();
      } catch (e) {
        if (client !== c) return;
        append({ dir: "error", text: errMsg(e), t: Date.now() });
        const failure: ConnectFailure = {
          name: e instanceof Error ? e.name : "Error",
          code: e instanceof ElmError ? e.code : undefined,
          command: e instanceof ElmError ? e.command : undefined,
          afterTransport: c.isOpen,
        };
        set({ status: "error", error: errMsg(e), failure });
        client = null;
        await c.disconnect().catch(() => {});
      } finally {
        if (transport instanceof WebBluetoothTransport) {
          // Keep what we discovered even on failure: that is exactly when the user needs the UUIDs.
          set({ gatt: transport.gatt, selected: transport.selected, writeMethod: transport.writeMethod, deviceName: transport.deviceName });
        } else {
          set({ deviceName: "Simulator (demo)" });
        }
      }
    },

    async disconnect() {
      const c = client;
      client = null;
      set({ status: "idle", mode: null, voltage: "", protocol: "", elmVersion: "", vehicleError: null });
      await c?.disconnect().catch(() => {});
    },

    async sendRaw(cmd) {
      const c = client;
      const text = cmd.trim();
      if (!text) return;
      if (!c?.isOpen) {
        append({ dir: "error", text: `not connected: ${text}`, t: Date.now() });
        return;
      }
      try {
        const lines = await c.send(text, { timeoutMs: 10000 });
        append({ dir: "info", text: `${text} → ${lines.join(" | ") || "(empty)"}${decodeHint(text, lines)}`, t: Date.now() });
      } catch (e) {
        append({ dir: "error", text: e instanceof ElmError ? `${text} → ${e.code}` : errMsg(e), t: Date.now() });
      }
    },

    async refreshVoltage() {
      try {
        const lines = (await client?.send("ATRV")) ?? [];
        set({ voltage: lines[0] ?? "" });
      } catch {
        set({ voltage: "?" });
      }
    },

    clearLog: () => set({ log: [] }),
  };
});
