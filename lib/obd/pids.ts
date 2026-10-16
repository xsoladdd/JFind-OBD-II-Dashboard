/** Mode 01 PIDs we decode. Formulas from SAE J1979; A, B are the data bytes after "41 <pid>". */
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
}

const A = (d: number[]) => d[0] ?? 0;
const AB = (d: number[]) => (d[0] ?? 0) * 256 + (d[1] ?? 0);
const pct = (d: number[]) => (A(d) * 100) / 255;
const temp = (d: number[]) => A(d) - 40;
const trim = (d: number[]) => (A(d) * 100) / 128 - 100;

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
];

export const PIDS: Record<string, PidDef> = Object.fromEntries(list.map((p) => [p.id, p]));
export const PID_LIST = list;
