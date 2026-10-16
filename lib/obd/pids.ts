/**
 * Mode 01 PIDs we decode. Formulas from SAE J1979 (cross-checked against the Wikipedia "OBD-II PIDs" reproduction);
 * A, B are the data bytes after "41 <pid>". See docs/custom-pids.md.
 */
export type GaugeType = "dial" | "bar" | "number";

export interface PidDef {
  id: string; // "010C"
  name: string;
  unit: string;
  bytes: number;
  min: number; // display range, not the encodable range
  max: number;
  gauge: GaugeType;
  decode: (d: number[]) => number;
  /** Request to send when it isn't the id: two-value PIDs are two entries sharing one command. */
  cmd?: string;
  /** Enum / bit-status PIDs: decode gives the raw code, text renders it. Kept out of gauges and alerts. */
  text?: (v: number) => string;
}

export const cmdOf = (p: PidDef) => p.cmd ?? p.id;

const A = (d: number[]) => d[0] ?? 0;
const AB = (d: number[]) => (d[0] ?? 0) * 256 + (d[1] ?? 0);
const pct = (d: number[]) => (A(d) * 100) / 255;
const temp = (d: number[]) => A(d) - 40;
const trim = (d: number[]) => (A(d) * 100) / 128 - 100;
const B = (d: number[]) => d.slice(1);
const torque = (d: number[]) => A(d) - 125;
const pick = (names: Record<number, string>) => (v: number) => names[v] ?? `Code ${v}`;

const FUEL_SYSTEM: Record<number, string> = {
  0: "—",
  1: "Open loop (engine cold)",
  2: "Closed loop",
  4: "Open loop (load or decel)",
  8: "Open loop (system fault)",
  16: "Closed loop (O2 sensor fault)",
};
// 0103 packs system 1 in A and system 2 in B.
const fuelSystem = (v: number) => `1: ${pick(FUEL_SYSTEM)(v >> 8)} · 2: ${pick(FUEL_SYSTEM)(v & 0xff)}`;
// Codes 14 and up exist (heavy duty, Brazil, Korea, India) but aren't listed here [verify].
const OBD_STANDARD = pick({
  1: "OBD-II (CARB)", 2: "OBD (EPA)", 3: "OBD and OBD-II", 4: "OBD-I", 5: "Not OBD compliant", 6: "EOBD (Europe)",
  7: "EOBD and OBD-II", 8: "EOBD and OBD", 9: "EOBD, OBD and OBD-II", 10: "JOBD (Japan)", 11: "JOBD and OBD-II",
  12: "JOBD and EOBD", 13: "JOBD, EOBD and OBD-II",
});
const FUEL_TYPE = pick({
  0: "Not available", 1: "Gasoline", 2: "Methanol", 3: "Ethanol", 4: "Diesel", 5: "LPG", 6: "CNG", 7: "Propane",
  8: "Electric", 9: "Bifuel: gasoline", 10: "Bifuel: methanol", 11: "Bifuel: ethanol", 12: "Bifuel: LPG",
  13: "Bifuel: CNG", 14: "Bifuel: propane", 15: "Bifuel: electricity", 16: "Bifuel: electric and combustion",
  17: "Hybrid gasoline", 18: "Hybrid ethanol", 19: "Hybrid diesel", 20: "Hybrid electric",
  21: "Hybrid: electric and combustion", 22: "Hybrid regenerative", 23: "Bifuel: diesel",
});
/** 0113 bits: A0..A3 bank 1 sensors 1–4, A4..A7 bank 2. 011D: two sensors per bank, four banks. */
const o2Present = (perBank: number) => (v: number) =>
  [...Array(8).keys()].filter((i) => v & (1 << i)).map((i) => `B${Math.floor(i / perBank) + 1}S${(i % perBank) + 1}`).join(" ") || "None";

const def = (id: string, name: string, unit: string, bytes: number, min: number, max: number, gauge: GaugeType, decode: PidDef["decode"]): PidDef =>
  ({ id, name, unit, bytes, min, max, gauge, decode });
const status = (id: string, name: string, bytes: number, decode: PidDef["decode"], text: PidDef["text"]): PidDef =>
  ({ ...def(id, name, "", bytes, 0, 0, "number", decode), text });
// 0114–011B: A = voltage (0.005 V/bit), B = the sensor's short-term trim. Which bank/sensor N is depends on 0113 vs 011D.
// B = FF means "not used for trim" and decodes to 99.2 %, hence the full ±100 range.
const o2 = (n: number): PidDef[] => {
  const cmd = `01${(0x13 + n).toString(16).toUpperCase()}`;
  return [
    def(cmd, `O2 sensor ${n} voltage`, "V", 2, 0, 1.275, "bar", (d) => A(d) / 200),
    { ...def(`${cmd}T`, `O2 sensor ${n} short term trim`, "%", 2, -100, 100, "bar", (d) => trim(B(d))), cmd },
  ];
};

const list: PidDef[] = [
  { id: "0104", name: "Engine load", unit: "%", bytes: 1, min: 0, max: 100, gauge: "bar", decode: pct },
  { id: "0105", name: "Coolant temp", unit: "°C", bytes: 1, min: -40, max: 130, gauge: "dial", decode: temp },
  { id: "0106", name: "Short term fuel trim B1", unit: "%", bytes: 1, min: -25, max: 25, gauge: "bar", decode: trim },
  { id: "0107", name: "Long term fuel trim B1", unit: "%", bytes: 1, min: -25, max: 25, gauge: "bar", decode: trim },
  { id: "010A", name: "Fuel pressure", unit: "kPa", bytes: 1, min: 0, max: 765, gauge: "number", decode: (d) => A(d) * 3 },
  { id: "010B", name: "Intake manifold pressure", unit: "kPa", bytes: 1, min: 0, max: 255, gauge: "dial", decode: A },
  { id: "010C", name: "Engine RPM", unit: "rpm", bytes: 2, min: 0, max: 8000, gauge: "dial", decode: (d) => AB(d) / 4 },
  { id: "010D", name: "Vehicle speed", unit: "km/h", bytes: 1, min: 0, max: 240, gauge: "dial", decode: A },
  { id: "010E", name: "Timing advance", unit: "°", bytes: 1, min: -64, max: 63.5, gauge: "number", decode: (d) => A(d) / 2 - 64 },
  { id: "010F", name: "Intake air temp", unit: "°C", bytes: 1, min: -40, max: 100, gauge: "number", decode: temp },
  { id: "0110", name: "MAF air flow", unit: "g/s", bytes: 2, min: 0, max: 300, gauge: "bar", decode: (d) => AB(d) / 100 },
  { id: "0111", name: "Throttle position", unit: "%", bytes: 1, min: 0, max: 100, gauge: "bar", decode: pct },
  { id: "011F", name: "Run time since start", unit: "s", bytes: 2, min: 0, max: 65535, gauge: "number", decode: AB },
  { id: "012F", name: "Fuel level", unit: "%", bytes: 1, min: 0, max: 100, gauge: "bar", decode: pct },
  { id: "0133", name: "Barometric pressure", unit: "kPa", bytes: 1, min: 0, max: 255, gauge: "number", decode: A },
  { id: "0142", name: "Control module voltage", unit: "V", bytes: 2, min: 0, max: 16, gauge: "number", decode: (d) => AB(d) / 1000 },
  { id: "0146", name: "Ambient air temp", unit: "°C", bytes: 1, min: -40, max: 60, gauge: "number", decode: temp },
  { id: "015C", name: "Engine oil temp", unit: "°C", bytes: 1, min: -40, max: 160, gauge: "dial", decode: temp },
  { id: "015E", name: "Engine fuel rate", unit: "L/h", bytes: 2, min: 0, max: 50, gauge: "number", decode: (d) => AB(d) / 20 },
  status("0103", "Fuel system status", 2, AB, fuelSystem),
  def("0108", "Short term fuel trim B2", "%", 1, -25, 25, "bar", trim),
  def("0109", "Long term fuel trim B2", "%", 1, -25, 25, "bar", trim),
  status("0113", "O2 sensors present (2 banks)", 1, A, o2Present(4)),
  ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap(o2),
  status("011C", "OBD standard", 1, A, OBD_STANDARD),
  status("011D", "O2 sensors present (4 banks)", 1, A, o2Present(2)),
  def("0121", "Distance with MIL on", "km", 2, 0, 65535, "number", AB),
  def("012C", "Commanded EGR", "%", 1, 0, 100, "bar", pct),
  def("012D", "EGR error", "%", 1, -100, 100, "bar", trim),
  def("012E", "Commanded evap purge", "%", 1, 0, 100, "bar", pct),
  def("0130", "Warm-ups since codes cleared", "", 1, 0, 255, "number", A),
  def("0131", "Distance since codes cleared", "km", 2, 0, 65535, "number", AB),
  def("0143", "Absolute load", "%", 2, 0, 100, "bar", (d) => (AB(d) * 100) / 255),
  def("0144", "Commanded equivalence ratio", "ratio", 2, 0, 2, "number", (d) => (AB(d) * 2) / 65536),
  def("0145", "Relative throttle position", "%", 1, 0, 100, "bar", pct),
  def("0147", "Absolute throttle position B", "%", 1, 0, 100, "bar", pct),
  def("0148", "Absolute throttle position C", "%", 1, 0, 100, "bar", pct),
  def("0149", "Accelerator pedal position D", "%", 1, 0, 100, "bar", pct),
  def("014A", "Accelerator pedal position E", "%", 1, 0, 100, "bar", pct),
  def("014B", "Accelerator pedal position F", "%", 1, 0, 100, "bar", pct),
  def("014C", "Commanded throttle actuator", "%", 1, 0, 100, "bar", pct),
  def("014D", "Time run with MIL on", "min", 2, 0, 65535, "number", AB),
  def("014E", "Time since codes cleared", "min", 2, 0, 65535, "number", AB),
  status("0151", "Fuel type", 1, A, FUEL_TYPE),
  def("0152", "Ethanol fuel", "%", 1, 0, 100, "bar", pct),
  def("0159", "Fuel rail absolute pressure", "kPa", 2, 0, 30000, "number", (d) => AB(d) * 10),
  def("015A", "Relative accelerator pedal", "%", 1, 0, 100, "bar", pct),
  def("0161", "Driver demand torque", "%", 1, -125, 130, "bar", torque),
  def("0162", "Actual engine torque", "%", 1, -125, 130, "bar", torque),
  def("0163", "Engine reference torque", "Nm", 2, 0, 1000, "number", AB),
];

export const PIDS: Record<string, PidDef> = Object.fromEntries(list.map((p) => [p.id, p]));
export const PID_LIST = list;
