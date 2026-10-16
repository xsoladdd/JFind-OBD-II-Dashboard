// Garage simulator block: odometer PID A6 for Demo mode. Hooked into Elm327Emulator.answer() with one line.
export const SIM_ODOMETER_KM = 84213.4; // demo data, not a real car

/** Mode 01 replies for 01A0 (supported-PID mask, only A6 set) and 01A6 (odometer, 0.1 km/bit). Null = not ours. */
export function garageAnswer(mode: number, pid: number | undefined): number[] | null {
  if (mode !== 0x01) return null;
  if (pid === 0xa0) return [0x41, 0xa0, 0x04, 0x00, 0x00, 0x00];
  if (pid === 0xa6) {
    const v = Math.round(SIM_ODOMETER_KM * 10);
    return [0x41, 0xa6, (v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
  }
  return null;
}
