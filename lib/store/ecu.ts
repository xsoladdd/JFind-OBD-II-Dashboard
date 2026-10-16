import { create } from "zustand";
import type { ElmClient } from "../elm/ElmClient";
import { measure, sampleMin, type CrankResult } from "../ecu/battery";
import { canIdChars, readPerEcu, type EcuReport } from "../ecu/headers";
import { readMode06, type MonitorTest } from "../ecu/mode06";
import { readVehicleInfo, type VehicleInfo } from "../ecu/mode09";
import { withPollingPaused } from "../polling/pause";
import type { SimBattery } from "../sim/advanced";
import { SimulatorTransport } from "../transport/SimulatorTransport";
import { getClient, useConnection } from "./connection";

export const CRANK_WINDOW_MS = 5000;

export interface Section<T> {
  status: "idle" | "running" | "done" | "error";
  data: T | null;
  error: string;
}

/** Mode 06: decoded tests on CAN; on older protocols only the raw 0600 reply (different, undecoded format). */
export type Mode06Data = { tests: MonitorTest[]; raw: string[] | null };
type SectionKey = "mode06" | "perEcu" | "info";

export interface BatteryState {
  running: "resting" | "cranking" | "charging" | null;
  live: number | null;
  resting: number | null;
  crank: CrankResult | null;
  charging: number | null;
  error: string;
}

interface EcuState {
  /** One ELM operation at a time: ATH1 must never interleave with another read. */
  busy: boolean;
  mode06: Section<Mode06Data>;
  perEcu: Section<EcuReport[]>;
  info: Section<VehicleInfo>;
  battery: BatteryState;
  readMode06: () => Promise<void>;
  readPerEcu: () => Promise<void>;
  readInfo: () => Promise<void>;
  batteryStep: (step: "resting" | "cranking" | "charging") => Promise<void>;
  resetBattery: () => void;
}

const idle = { status: "idle", data: null, error: "" } as const;
const NO_BATTERY: BatteryState = { running: null, live: null, resting: null, crank: null, charging: null, error: "" };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Demo mode only: tell the emulator what the "engine" is doing, since nobody can turn a key. */
function demoBattery(state: SimBattery["state"]) {
  const t = getClient()?.transport;
  if (t instanceof SimulatorTransport) t.emulator.battery = { state, since: Date.now() };
}

export const useEcu = create<EcuState>((set, get) => {
  async function exclusive<T>(job: (c: ElmClient) => Promise<T>): Promise<T> {
    const c = getClient();
    if (!c?.isOpen) throw new Error("Not connected");
    set({ busy: true });
    try {
      return await withPollingPaused(() => job(c));
    } finally {
      set({ busy: false });
    }
  }

  async function section<K extends SectionKey>(key: K, job: (c: ElmClient, dpn: string) => Promise<EcuState[K]["data"]>) {
    if (get().busy) return;
    set({ [key]: { status: "running", data: null, error: "" } } as Partial<EcuState>);
    try {
      const data = await exclusive((c) => job(c, useConnection.getState().protocol));
      set({ [key]: { status: "done", data, error: "" } } as Partial<EcuState>);
    } catch (e) {
      set({ [key]: { status: "error", data: null, error: errMsg(e) } } as Partial<EcuState>);
    }
  }

  return {
    busy: false,
    mode06: idle,
    perEcu: idle,
    info: idle,
    battery: NO_BATTERY,

    readMode06: () =>
      section("mode06", async (c, dpn) =>
        canIdChars(dpn) ? { tests: await readMode06(c), raw: null } : { tests: [], raw: await c.send("0600", { timeoutMs: 5000 }) },
      ),
    readPerEcu: () => section("perEcu", readPerEcu),
    readInfo: () => section("info", (c) => readVehicleInfo(c)),

    async batteryStep(step) {
      if (get().busy) return;
      const patch = (p: Partial<BatteryState>) => set((s) => ({ battery: { ...s.battery, ...p } }));
      patch({ running: step, live: null, error: "" });
      try {
        await exclusive(async (c) => {
          if (step === "resting") {
            demoBattery("off");
            patch({ resting: await measure(c) });
          } else if (step === "charging") {
            demoBattery("running");
            patch({ charging: await measure(c) });
          } else {
            demoBattery("off");
            const demoCrank = setTimeout(() => demoBattery("cranking"), 1000);
            try {
              patch({ crank: await sampleMin(c, CRANK_WINDOW_MS, (v) => patch({ live: v })) });
            } finally {
              clearTimeout(demoCrank);
            }
          }
        });
      } catch (e) {
        patch({ error: errMsg(e) });
      } finally {
        patch({ running: null });
      }
    },

    resetBattery: () => set({ battery: NO_BATTERY }),
  };
});
