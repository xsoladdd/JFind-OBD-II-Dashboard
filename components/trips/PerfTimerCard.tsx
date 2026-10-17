"use client";

import { useEffect, useState } from "react";
import { useDisplay } from "@/components/dashboard/live";
import { Badge, Button, Disclosure, NO_VALUE, Panel, Stat, StoppedOnly, type Tone } from "@/components/ui";
import { useFolder } from "@/lib/storage/folder";
import { useConnection } from "@/lib/store/connection";
import { useLive } from "@/lib/store/live";
import { bestRun, usePerf } from "@/lib/store/perf";
import { usePerfNoticeSeen, useUnits } from "@/lib/store/settings";
import { simLaunch } from "@/lib/sim/trips";
import type { PerfResult, PerfRun } from "@/lib/trips/perf";
import { disp } from "./format";
import { SafetyNotice } from "./SafetyNotice";

const metres = (m: number, units: string) => (units === "imperial" ? `${(m / 0.3048).toFixed(0)} ft` : `${m.toFixed(1)} m`);
const s2 = (s?: number) => (s === undefined ? NO_VALUE : `${s.toFixed(2)} s`);

const METRICS = [
  { key: "to100", label: "0-100 km/h", show: (r: PerfResult) => s2(r.to100) },
  { key: "to60mph", label: "0-60 mph", show: (r: PerfResult) => s2(r.to60mph) },
  { key: "quarter", label: "¼ mile", show: (r: PerfResult) => s2(r.quarter?.s) },
  { key: "brake", label: "100-0 km/h", show: (r: PerfResult) => s2(r.brake?.s) },
] as const;

/** Hands-free 0-100 / 0-60 mph / quarter mile / 100-0 timer from 010D. One big Arm; results glanceable; details parked. */
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
  const [word, tone, status]: [string, Tone, string] =
    phase === "idle"
      ? ["Off", "neutral", "Arm it while stopped; it starts when you move off and stops when you stop."]
      : phase === "running"
        ? ["Running", "accent", "Running…"]
        : ready
          ? ["Ready", "ok", "Ready: move off to start."]
          : ["Stop first", "warn", "Armed: come to a complete stop first."];

  return (
    <Panel title="Performance timer">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Stat size="lg" label="Speed" value={speed.value === undefined ? null : Math.round(speed.value)} unit={speed.unit} />
        <Badge tone={tone} className="px-3 py-1 text-base">
          {word}
        </Badge>
      </div>
      <p className="mt-3 text-fg-muted" aria-live="polite">
        {status}
      </p>

      <div className="mt-4">
        {notice ? (
          <SafetyNotice
            what="the timer"
            onAccept={() => {
              setSeen(true);
              setNotice(false);
              arm();
            }}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 short:grid-cols-1">
            {phase === "idle" ? (
              <Button variant="primary" size="drive" onClick={() => (seen ? arm() : setNotice(true))}>
                Arm
              </Button>
            ) : (
              <Button size="drive" onClick={disarm}>
                Disarm
              </Button>
            )}
            {demo && phase !== "idle" && (
              <Button size="drive" onClick={() => simLaunch()} title="Demo mode: the simulator does one launch and brake">
                Demo launch
              </Button>
            )}
          </div>
        )}
      </div>

      <table className="mt-5 w-full">
        <thead className="text-left text-sm text-fg-faint">
          <tr>
            <th scope="col" className="py-1 font-medium">
              <span className="sr-only">Measure</span>
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              {live ? "This run" : "Last"}
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              Best
            </th>
          </tr>
        </thead>
        <tbody>
          {METRICS.map((m) => {
            const best = bestRun(runs, m.key);
            return (
              <tr key={m.key} className="border-t border-line">
                <th scope="row" className="py-2 text-left font-medium text-fg-muted">
                  {m.label}
                </th>
                <td className="num py-2 text-right text-2xl">{live ? m.show(live) : last ? m.show(last) : NO_VALUE}</td>
                <td className="num py-2 text-right text-2xl text-accent">{best ? m.show(best) : NO_VALUE}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(live?.quarter ?? last?.quarter) && (
        <p className="mt-2 text-sm text-fg-muted">
          ¼ mile trap speed: {disp((live?.quarter ?? last?.quarter)!.trapKmh, "km/h", units).join(" ")}
          {(live?.brake ?? last?.brake) && <>, braking distance {metres((live?.brake ?? last?.brake)!.m, units)}</>}
        </p>
      )}

      <div className="mt-4 space-y-3">
        <Disclosure variant="inset" summary="How accurate the times are">
          <p className="text-sm text-fg-muted">
            {live || last ? `Speed readings: ${(live ?? last)!.hz.toFixed(1)} per second.` : `Adapter: ${hz.toFixed(1)} reads per second across all PIDs.`} Times are
            approximate: crossings are interpolated between readings, the car reports whole km/h, and the start is the last 0 km/h reading. Accuracy is
            limited by how often the adapter updates speed.
          </p>
        </Disclosure>
        {runs.length > 0 && (
          <Disclosure variant="inset" summary={`Recent runs (${runs.length})`}>
            <StoppedOnly label="Recent runs">
              <RecentRuns runs={runs} />
            </StoppedOnly>
          </Disclosure>
        )}
      </div>
    </Panel>
  );
}

function RecentRuns({ runs }: { runs: PerfRun[] }) {
  return (
    <ul className="space-y-2 text-sm">
      {runs.map((r) => (
        <li key={r.at} className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-2">
          <span className="text-fg-faint">{new Date(r.at).toLocaleTimeString()}</span>
          {METRICS.map((m) => (
            <span key={m.key}>
              <span className="text-fg-muted">{m.label}</span> <span className="num">{m.show(r)}</span>
            </span>
          ))}
          <span className="num text-fg-faint">{r.hz.toFixed(1)} Hz</span>
        </li>
      ))}
    </ul>
  );
}
