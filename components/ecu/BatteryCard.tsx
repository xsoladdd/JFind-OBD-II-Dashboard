"use client";

import { BANDS, classify, type BatteryPhase } from "@/lib/ecu/battery";
import { CRANK_WINDOW_MS, useEcu } from "@/lib/store/ecu";
import { Card, ErrorText, Verify } from "./ui";

const STEPS: { phase: BatteryPhase; title: string; how: string; button: string }[] = [
  { phase: "resting", title: "1. Resting voltage", how: "Engine off, ignition on, lights and fans off.", button: "Measure" },
  {
    phase: "cranking",
    title: "2. Cranking voltage",
    how: `Tap Start, then crank the engine right away. The lowest voltage over ${CRANK_WINDOW_MS / 1000} s is kept.`,
    button: "Start, then crank now",
  },
  { phase: "charging", title: "3. Charging voltage", how: "Engine idling, electrical loads off.", button: "Measure" },
];

function Reading({ phase, volts, extra }: { phase: BatteryPhase; volts: number; extra?: string }) {
  const v = classify(phase, volts);
  return (
    <p className="text-sm">
      <span className="font-mono text-lg">{volts.toFixed(2)} V</span>{" "}
      <span className={v.ok ? "text-emerald-300" : "text-red-300"}>{v.label}</span>
      {extra && <span className="block text-xs text-zinc-500">{extra}</span>}
    </p>
  );
}

export function BatteryCard() {
  const { battery: b, busy, batteryStep, resetBattery } = useEcu();
  const value = { resting: b.resting, cranking: b.crank?.min ?? null, charging: b.charging };

  return (
    <Card
      title="Battery and charging test"
      intro={
        <>
          Uses the adapter&apos;s voltage reading (ATRV). The bands are <strong>general guidance for 12 V lead-acid systems, not
          manufacturer specs</strong> <Verify />.
        </>
      }
    >
      {STEPS.map((s) => (
        <div key={s.phase} className="rounded-md border border-zinc-800 px-3 py-2">
          <h3 className="text-sm font-semibold">{s.title}</h3>
          <p className="text-sm text-zinc-400">{s.how}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={() => void batteryStep(s.phase)}
              disabled={busy}
              className="rounded-md bg-sky-600 px-4 py-2 font-semibold hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {b.running === s.phase ? (s.phase === "cranking" ? "Crank now…" : "Measuring…") : s.button}
            </button>
            {b.running === "cranking" && s.phase === "cranking" && b.live !== null && (
              <span className="font-mono text-sm" aria-live="polite">
                {b.live.toFixed(1)} V
              </span>
            )}
          </div>
          {value[s.phase] !== null && b.running !== s.phase && (
            <div className="mt-2">
              <Reading
                phase={s.phase}
                volts={value[s.phase]!}
                extra={s.phase === "cranking" && b.crank ? `lowest of ${b.crank.samples} readings in ${(b.crank.ms / 1000).toFixed(1)} s` : undefined}
              />
            </div>
          )}
          <ul className="mt-2 text-xs text-zinc-500">
            {BANDS[s.phase].map((band) => (
              <li key={band}>{band}</li>
            ))}
          </ul>
        </div>
      ))}
      <ErrorText error={b.error} />
      <details className="text-xs text-zinc-400">
        <summary className="cursor-pointer">Limits of this test</summary>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li>The adapter measures at the OBD port (pin 16), not the battery terminals, so it can read a little low. <Verify /></li>
          <li>A resting reading right after driving includes surface charge. Let the car sit for a few hours for a true reading.</li>
          <li>The cranking dip can be shorter than one Bluetooth round trip, so the true minimum may be missed.</li>
          <li>AGM, EFB/start-stop batteries and smart alternators often run outside these bands by design.</li>
        </ul>
      </details>
      <button onClick={resetBattery} disabled={busy} className="text-sm text-sky-300 underline disabled:opacity-40">
        Clear readings
      </button>
    </Card>
  );
}
