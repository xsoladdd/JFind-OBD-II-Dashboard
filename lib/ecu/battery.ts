type Sender = { send: (cmd: string, opts?: { timeoutMs?: number }) => Promise<string[]> };

export type BatteryPhase = "resting" | "cranking" | "charging";
export interface Verdict {
  label: string;
  ok: boolean;
}

/**
 * General guidance for 12 V lead-acid systems, NOT manufacturer specs. Every threshold is a README [verify] item.
 * AGM, EFB/start-stop and smart-alternator cars can legitimately sit outside these bands.
 */
export const BANDS: Record<BatteryPhase, string[]> = {
  resting: ["≥ 12.6 V: fully charged", "12.4 – 12.6 V: partly charged", "12.0 – 12.4 V: low", "< 12.0 V: discharged"],
  cranking: ["≥ 9.6 V: held up under load", "< 9.6 V: weak under load"],
  charging: ["< 13.2 V: low, may not be charging", "13.2 – 14.8 V: charging", "> 14.8 V: high, possible overcharging"],
};

export function classify(phase: BatteryPhase, v: number): Verdict {
  if (phase === "resting") {
    if (v >= 12.6) return { label: "Fully charged", ok: true };
    if (v >= 12.4) return { label: "Partly charged", ok: true };
    return { label: v >= 12.0 ? "Low" : "Discharged", ok: false };
  }
  if (phase === "cranking") return v >= 9.6 ? { label: "Held up under load", ok: true } : { label: "Weak under load", ok: false };
  if (v > 14.8) return { label: "High: possible overcharging", ok: false };
  return v >= 13.2 ? { label: "Charging", ok: true } : { label: "Low: may not be charging", ok: false };
}

/** "12.4V" → 12.4 */
export function parseVolts(lines: string[]): number {
  const v = parseFloat(lines[0] ?? "");
  if (!Number.isFinite(v)) throw new Error(`ATRV: unexpected reply "${lines.join(" ")}"`);
  return v;
}

/** Average of n ATRV readings. */
export async function measure(client: Sender, n = 3): Promise<number> {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += parseVolts(await client.send("ATRV"));
  return sum / n;
}

export interface CrankResult {
  min: number;
  samples: number;
  ms: number;
}

/** ATRV back to back for ms; the lowest reading is the cranking voltage. A dip shorter than one round trip can be missed. */
export async function sampleMin(client: Sender, ms: number, onSample?: (v: number) => void): Promise<CrankResult> {
  const start = Date.now();
  let min = Infinity;
  let samples = 0;
  while (Date.now() - start < ms) {
    const v = parseVolts(await client.send("ATRV"));
    min = Math.min(min, v);
    samples++;
    onSample?.(v);
  }
  return { min, samples, ms: Date.now() - start };
}
