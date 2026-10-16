"use client";

import { useEffect, useState } from "react";
import { useDisplay } from "@/components/dashboard/live";
import { useFolder } from "@/lib/storage/folder";
import { useConnection } from "@/lib/store/connection";
import { useLive } from "@/lib/store/live";
import { bestRun, usePerf } from "@/lib/store/perf";
import { usePerfNoticeSeen, useUnits } from "@/lib/store/settings";
import { simLaunch } from "@/lib/sim/trips";
import type { PerfResult, PerfRun } from "@/lib/trips/perf";
import { btn, btnPrimary, card, disp } from "./ui";

const metres = (m: number, units: string) => (units === "imperial" ? `${(m / 0.3048).toFixed(0)} ft` : `${m.toFixed(1)} m`);
const s2 = (s?: number) => (s === undefined ? "—" : `${s.toFixed(2)} s`);

const METRICS = [
  { key: "to100", label: "0–100 km/h", show: (r: PerfResult) => s2(r.to100) },
  { key: "to60mph", label: "0–60 mph", show: (r: PerfResult) => s2(r.to60mph) },
  { key: "quarter", label: "¼ mile", show: (r: PerfResult) => s2(r.quarter?.s) },
  { key: "brake", label: "100–0 km/h", show: (r: PerfResult) => s2(r.brake?.s) },
] as const;

/** Hands-free 0–100 / 0–60 mph / quarter mile / 100–0 timer from 010D. */
export function PerfTimerCard() {
  const { phase, ready, live, runs, arm, disarm } = usePerf();
  const [seen, setSeen] = usePerfNoticeSeen();
  const [notice, setNotice] = useState(false);
  const [units] = useUnits();
  const speed = useDisplay("010D");
  const hz = useLive((s) => s.hz);
  const demo = useConnection((s) => s.mode === "demo");

  const folder = useFolder((s) => s.status);
  useEffect(() => () => usePerf.getState().disarm(), []); // fast polling only while this screen is open
  useEffect(() => void usePerf.getState().load(), [folder]);

  const last = runs[0];
  const status =
    phase === "idle"
      ? "Off. Arm it while stopped; it starts when you move off and stops when you stop."
      : phase === "running"
        ? "Running…"
        : ready
          ? "Ready: move off to start."
          : "Armed: come to a complete stop first.";

  return (
    <section className={card} aria-label="Performance timer">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-semibold">Performance timer</h2>
        <span className="ml-auto font-mono text-2xl tabular-nums">
          {speed.value === undefined ? "—" : Math.round(speed.value)}
          <span className="ml-1 text-xs text-zinc-400">{speed.unit}</span>
        </span>
      </div>

      {notice ? (
        <div role="alertdialog" aria-label="Safety notice" className="rounded-md border border-amber-600/50 bg-amber-500/10 p-3 text-sm">
          <p className="mb-2">
            Only use the timer where it&apos;s legal and safe, such as a closed course. Never on public roads. Keep your eyes on
            the road: it runs hands-free.
          </p>
          <button
            className={btnPrimary}
            onClick={() => {
              setSeen(true);
              setNotice(false);
              arm();
            }}
          >
            I understand, arm
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {phase === "idle" ? (
            <button className={btnPrimary} onClick={() => (seen ? arm() : setNotice(true))}>
              Arm
            </button>
          ) : (
            <button className={btn} onClick={disarm}>
              Disarm
            </button>
          )}
          {demo && phase !== "idle" && (
            <button className={btn} onClick={() => simLaunch()} title="Demo mode: the simulator does one launch and brake">
              Demo launch
            </button>
          )}
          <p className={`text-sm ${phase === "running" ? "text-red-300" : ready ? "text-emerald-300" : "text-zinc-400"}`} aria-live="polite">
            {status}
          </p>
        </div>
      )}

      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="py-1 font-medium" />
            <th className="py-1 text-right font-medium">{live ? "This run" : "Last"}</th>
            <th className="py-1 text-right font-medium">Best</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {METRICS.map((m) => {
            const best = bestRun(runs, m.key);
            return (
              <tr key={m.key} className="border-t border-zinc-800">
                <td className="py-1.5 font-sans">{m.label}</td>
                <td className="py-1.5 text-right">{live ? m.show(live) : last ? m.show(last) : "—"}</td>
                <td className="py-1.5 text-right text-emerald-300">{best ? m.show(best) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(live?.quarter ?? last?.quarter) && (
        <p className="mt-1 text-xs text-zinc-400">
          ¼ mile trap speed: {disp((live?.quarter ?? last?.quarter)!.trapKmh, "km/h", units).join(" ")}
          {(live?.brake ?? last?.brake) && <> · braking distance {metres((live?.brake ?? last?.brake)!.m, units)}</>}
        </p>
      )}

      <p className="mt-2 text-xs text-zinc-500">
        {live || last ? `Speed readings: ${(live ?? last)!.hz.toFixed(1)} per second.` : `Adapter: ${hz.toFixed(1)} reads per second across all PIDs.`} Times are approximate: crossings are
        interpolated between readings, the car reports whole km/h, and the start is the last 0 km/h reading. Accuracy is
        limited by how often the adapter updates speed.
      </p>

      {runs.length > 0 && <RecentRuns runs={runs} />}
    </section>
  );
}

function RecentRuns({ runs }: { runs: PerfRun[] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-zinc-300">Recent runs ({runs.length})</summary>
      <ul className="mt-2 space-y-1 font-mono text-xs tabular-nums">
        {runs.map((r) => (
          <li key={r.at} className="flex flex-wrap gap-x-3 border-t border-zinc-800 pt-1">
            <span className="text-zinc-500">{new Date(r.at).toLocaleTimeString()}</span>
            {METRICS.map((m) => (
              <span key={m.key}>
                {m.label} {m.show(r)}
              </span>
            ))}
            <span className="text-zinc-500">{r.hz.toFixed(1)} Hz</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
