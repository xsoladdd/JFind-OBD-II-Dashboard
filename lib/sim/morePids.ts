/**
 * Demo values for the extra Mode 01 PIDs (lib/obd/pids.ts), derived from the fake engine so they move with it.
 * Made up for the demo, not real-car data. Spread into ENCODERS in elm327.ts.
 * The "car" has O2 sensors B1S1, B1S2, B2S1, B2S2 (0113 = 0x33), so 0116/0117/011A/011B and 011D aren't advertised,
 * nor 0148/014B (throttle C, pedal F), which many cars lack.
 */
import type { EngineState } from "./engine";

const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const word = (n: number) => {
  const v = Math.max(0, Math.min(0xffff, Math.round(n)));
  return [v >> 8, v & 0xff];
};
const pct = (n: number) => [clampByte((n * 255) / 100)];
const trim = (n: number) => clampByte(((n + 100) * 128) / 100);
// Upstream sensors swing with the short-term trim; downstream ones sit steady and aren't used for trim (B = FF).
const upstream = (e: EngineState) => [clampByte((0.45 - e.stft / 12) * 200), trim(e.stft)];
const downstream = () => [clampByte(0.65 * 200), 0xff];

export const MORE_ENCODERS: Record<number, (e: EngineState) => number[]> = {
  0x03: (e) => [e.coolant > 60 ? 0x02 : 0x01, 0x00], // closed loop once warm
  0x08: (e) => [trim(-e.stft * 0.6)],
  0x09: () => [trim(1.6)],
  0x13: () => [0x33],
  0x14: upstream,
  0x15: downstream,
  0x18: (e) => upstream({ ...e, stft: -e.stft * 0.6 }),
  0x19: downstream,
  0x1c: () => [6], // EOBD
  0x21: () => word(0),
  0x2c: (e) => pct(e.throttle > 5 && e.throttle < 30 ? 12 : 0),
  0x2d: (e) => [trim(e.stft / 4)],
  0x2e: (e) => pct(e.coolant > 60 ? 20 + e.throttle / 2 : 0),
  0x30: () => [12],
  0x31: () => word(1840),
  0x43: (e) => word((e.load * 0.9 * 255) / 100),
  0x44: (e) => word((1 - e.stft / 100) * 32768),
  0x45: (e) => pct(e.throttle * 0.9),
  0x47: (e) => pct(e.throttle + 14),
  0x49: (e) => pct(e.throttle * 0.8 + 15),
  0x4a: (e) => pct(e.throttle * 0.4 + 7.5),
  0x4c: (e) => pct(e.throttle),
  0x4d: () => word(0),
  0x4e: (e) => word(2650 + e.runTime / 60),
  0x51: () => [1], // gasoline
  0x52: () => pct(5),
  0x59: (e) => word((e.fuelPressure + e.baro) / 10),
  0x5a: (e) => pct(e.throttle * 0.8),
  0x61: (e) => [clampByte(e.load * 0.9 + 125)],
  0x62: (e) => [clampByte(e.load * 0.85 + 125)],
  0x63: () => word(320),
};
