/**
 * PID 01 (since DTCs cleared) and PID 41 (this drive cycle) monitor status, per SAE J1979
 * (bit layout as tabulated in Wikipedia "OBD-II PIDs", Service 01 PID 01).
 * A7 MIL, A6-A0 DTC count (PID 41: A is 0). B3 ignition type. B0-B2 common tests available, B4-B6 incomplete.
 * C = engine-specific tests available, D = incomplete (1 = not complete).
 */
export type MonitorState = "complete" | "incomplete" | "unsupported";

export interface MonitorStatus {
  mil: boolean;
  dtcCount: number;
  ignition: "spark" | "compression";
  monitors: { name: string; state: MonitorState }[];
}

const COMMON = ["Misfire", "Fuel system", "Components"];
// Bit 0..7 of bytes C/D. null = reserved.
const SPARK = [
  "Catalyst",
  "Heated catalyst",
  "Evaporative system",
  "Secondary air system",
  "Gasoline particulate filter",
  "Oxygen sensor",
  "Oxygen sensor heater",
  "EGR and/or VVT system",
];
const COMPRESSION = [
  "NMHC catalyst",
  "NOx/SCR monitor",
  null,
  "Boost pressure",
  null,
  "Exhaust gas sensor",
  "PM filter monitoring",
  "EGR and/or VVT system",
];

const state = (available: boolean, incomplete: boolean): MonitorState =>
  !available ? "unsupported" : incomplete ? "incomplete" : "complete";

/** The 4 data bytes after "41 01" / "41 41". */
export function decodeMonitorStatus([a = 0, b = 0, c = 0, d = 0]: number[]): MonitorStatus {
  const compression = (b & 0x08) !== 0;
  const monitors = COMMON.map((name, i) => ({ name, state: state(!!(b & (1 << i)), !!(b & (0x10 << i))) }));
  (compression ? COMPRESSION : SPARK).forEach((name, i) => {
    if (name) monitors.push({ name, state: state(!!(c & (1 << i)), !!(d & (1 << i))) });
  });
  return { mil: (a & 0x80) !== 0, dtcCount: a & 0x7f, ignition: compression ? "compression" : "spark", monitors };
}

/**
 * Several ECUs (engine, transmission…) can each answer 0101. The vehicle's status is the union:
 * MIL if any ECU requests it, counts summed, a monitor incomplete if any ECU supporting it says so.
 */
export function combineStatus(list: MonitorStatus[]): MonitorStatus | null {
  const [first, ...rest] = list;
  if (!first) return null;
  return rest.reduce(
    (acc, s) => ({
      mil: acc.mil || s.mil,
      dtcCount: acc.dtcCount + s.dtcCount,
      ignition: acc.ignition,
      monitors: acc.monitors.map((m, i) => {
        const o = s.monitors[i]?.name === m.name ? s.monitors[i]!.state : "unsupported";
        const states = [m.state, o];
        return {
          name: m.name,
          state: states.includes("incomplete") ? "incomplete" : states.includes("complete") ? "complete" : "unsupported",
        };
      }),
    }),
    first,
  );
}
