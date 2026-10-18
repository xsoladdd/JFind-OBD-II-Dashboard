/** A fake car: a repeating 60 s idle → accelerate → cruise → brake → idle cycle, plus noise. */
export interface EngineState {
  rpm: number;
  speed: number;
  throttle: number;
  load: number;
  coolant: number;
  iat: number;
  ambient: number;
  oil: number;
  maf: number;
  map: number;
  timing: number;
  stft: number;
  ltft: number;
  fuelLevel: number;
  fuelPressure: number;
  baro: number;
  runTime: number;
  moduleVoltage: number;
  fuelRate: number;
}

/** Deterministic PRNG (mulberry32) so tests can pin the noise. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Demo gearbox, rpm per km/h for gears 1–5 (made up, like a small petrol car). Not reported as PID 01A4. */
export const SIM_GEARS = [120, 68, 45, 34, 27];
const SHIFT_RPM = 2800;

/** The demo car shifts up at 2800 rpm and down when the next gear down fits; below ~9 km/h the clutch slips. */
function simRpm(speed: number) {
  if (speed === 0) return 780;
  const ratio = SIM_GEARS.find((r) => speed * r <= SHIFT_RPM) ?? SIM_GEARS.at(-1)!;
  return Math.max(1100, speed * ratio);
}

export function engineAt(t: number, rand: () => number): EngineState {
  const noise = (amp: number) => (rand() - 0.5) * 2 * amp;
  const phase = t % 60;
  let speed = 0;
  let throttle = 0;
  if (phase >= 10 && phase < 25) {
    const k = (phase - 10) / 15;
    speed = 90 * k;
    throttle = 45 - 15 * k;
  } else if (phase >= 25 && phase < 40) {
    speed = 90;
    throttle = 18;
  } else if (phase >= 40 && phase < 50) {
    speed = 90 * (1 - (phase - 40) / 10);
  }
  throttle = Math.max(0, throttle + noise(1.5));
  speed = Math.max(0, speed + (speed > 0 ? noise(0.8) : 0));
  const rpm = Math.max(600, simRpm(speed) + noise(25)); // from the noisy speed: in gear, wheels and engine move together
  const load = Math.min(100, 18 + throttle * 1.6 + noise(2));
  const maf = (rpm * load) / 5000;
  const warm = 1 - Math.exp(-t / 180);
  return {
    rpm,
    speed,
    throttle,
    load,
    coolant: 18 + 72 * warm + noise(0.4),
    oil: 18 + 80 * (1 - Math.exp(-t / 300)),
    iat: 22 + 8 * warm + noise(0.5),
    ambient: 17,
    maf,
    map: Math.min(101, 28 + load * 0.7 + noise(1)),
    timing: 8 + rpm / 400 - throttle / 8 + noise(0.5),
    stft: noise(4),
    ltft: 2.3,
    fuelLevel: Math.max(0, 62 - t / 120),
    fuelPressure: 380 + noise(6),
    baro: 101,
    runTime: Math.floor(t),
    moduleVoltage: 14.1 + noise(0.05),
    // g/s air → L/h fuel at stoichiometric 14.7:1, petrol ~740 g/L
    fuelRate: (maf * 3600) / (14.7 * 740),
  };
}
