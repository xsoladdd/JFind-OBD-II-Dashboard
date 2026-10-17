"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SERIES } from "@/components/dashboard/live";
import { Badge, Button, Disclosure, Field, InlineNote, Input, linkClass, Panel, Stat, StoppedOnly, Switch, type Tone } from "@/components/ui";
import { num } from "@/lib/garage/model";
import { SIM_DYNO_MASS_KG, simPull } from "@/lib/sim/dyno";
import { useFolder } from "@/lib/storage/folder";
import { useConnection } from "@/lib/store/connection";
import { useDyno } from "@/lib/store/dyno";
import { useGarage } from "@/lib/store/garage";
import { useLive } from "@/lib/store/live";
import { DEFAULT_DYNO, useDynoSettings, usePerfNoticeSeen, useUnits } from "@/lib/store/settings";
import {
  EXAMPLE_CDA_M2,
  EXAMPLE_CRR,
  forceUnit,
  powerUnit,
  RHO_ISA,
  showForce,
  showPower,
  showTorque,
  torqueUnit,
  tyreRadiusM,
  type DynoRun,
} from "@/lib/trips/dyno";
import type { UnitSystem } from "@/lib/units";
import { DynoChart, type DynoSeries } from "./DynoChart";
import { SafetyNotice } from "./SafetyNotice";

const vinKey = (vin: string | null | undefined) => (vin ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const when = (at: number) => new Date(at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "medium" });
const rpm = (n: number) => `${Math.round(n / 10) * 10}`;

const ESTIMATE_TITLE = "Estimated from engine speed, vehicle speed and the mass you entered (see the accuracy note).";

/** Wheel power and torque estimate from one single-gear full-throttle pull (docs/dyno.md). One big Arm; setup and charts parked. */
export function DynoCard() {
  const connected = useConnection((s) => s.status === "connected");
  const demo = useConnection((s) => s.mode === "demo");
  const profile = useGarage((s) => s.activeProfile);
  const { armed, climb, rejected, runs, arm, disarm } = useDyno();
  const [cfg, setCfg] = useDynoSettings();
  const [seen, setSeen] = usePerfNoticeSeen();
  const [notice, setNotice] = useState(false);
  const [units] = useUnits();
  const liveRpm = useLive((s) => s.values["010C"]?.value);
  const folder = useFolder((s) => s.status);

  const garageKg = profile?.weightKg ?? null;
  const curbKg = garageKg ?? (demo ? SIM_DYNO_MASS_KG : null);
  const vin = profile?.vin ?? null;
  const radius = tyreRadiusM(cfg.tyre);

  useEffect(() => () => useDyno.getState().disarm(), []); // fast polling only while this screen is open
  useEffect(() => void useDyno.getState().load(), [folder]);
  useEffect(() => {
    useDyno.setState({
      setup:
        curbKg === null
          ? null
          : {
              vin,
              inputs: {
                curbKg,
                extraKg: cfg.extraKg,
                demoMass: garageKg === null,
                losses: cfg.losses ? { crr: cfg.crr, cdaM2: cfg.cdaM2 } : null,
                rhoKgM3: RHO_ISA,
                tyre: cfg.tyre.trim(),
                tyreRadiusM: radius,
              },
            },
    });
  }, [curbKg, garageKg, vin, cfg.extraKg, cfg.losses, cfg.crr, cfg.cdaM2, cfg.tyre, radius]);
  useEffect(() => {
    if (curbKg === null) useDyno.getState().disarm();
  }, [curbKg]);

  const mine = runs.filter((r) => vinKey(r.vin) === vinKey(vin));
  const latest = mine[0]?.at;
  const [picked, setPicked] = useState<number[]>([]);
  const [shownLatest, setShownLatest] = useState<number | undefined>();
  if (latest !== shownLatest) {
    // a new run (or another car) shows its latest run
    setShownLatest(latest);
    setPicked(latest === undefined ? [] : [latest]);
  }
  const shown = picked.map((at) => mine.find((r) => r.at === at)).filter((r): r is DynoRun => !!r);
  const toggle = (at: number) => setPicked((p) => (p.includes(at) ? p.filter((x) => x !== at) : [...p, at].slice(-2)));

  const pulling = !!climb && armed && climb[1] - climb[0] > 300;
  const [word, tone, status]: [string, Tone, string] = !armed
    ? ["Off", "neutral", "Off. Arm it, hold one gear at low RPM, floor it to near the redline, then lift off."]
    : pulling
      ? ["Pull", "accent", `Pull: ${rpm(climb[1])} rpm`]
      : ["Armed", "ok", "Armed: in one gear, floor it from low RPM; lifting off ends the pull."];

  return (
    <Panel
      title="Dyno"
      action={
        <Badge tone="warn" title={ESTIMATE_TITLE}>
          Estimate
        </Badge>
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Stat size="lg" label="Engine speed" value={liveRpm === undefined || !connected ? null : Math.round(liveRpm)} unit="rpm" />
        <Badge tone={tone} className="px-3 py-1 text-base">
          {word}
        </Badge>
      </div>
      <p className="mt-3 text-fg-muted" aria-live="polite">
        {status}
      </p>

      {connected && (
        <div className="mt-4">
          {notice ? (
            <SafetyNotice
              what="the dyno"
              onAccept={() => {
                setSeen(true);
                setNotice(false);
                arm();
              }}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 short:grid-cols-1">
              {!armed ? (
                <Button size="drive" disabled={curbKg === null} onClick={() => (seen ? arm() : setNotice(true))}>
                  Arm
                </Button>
              ) : (
                <Button size="drive" onClick={disarm}>
                  Disarm
                </Button>
              )}
              {demo && armed && (
                <Button size="drive" onClick={() => simPull()} title="Demo mode: the simulator does one pull in 3rd gear">
                  Demo pull
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {rejected && (
        <InlineNote tone="warn" className="mt-4">
          Last pull not used: {rejected}.
        </InlineNote>
      )}

      {shown.length > 0 && <Peaks runs={shown} units={units} />}

      <p className="mt-4 text-sm text-fg-faint">
        Estimates power and torque at the wheels from one pull in a single gear, from engine speed, vehicle speed and the car&apos;s mass. It&apos;s an
        estimate, not a dynamometer.
      </p>

      <div className="mt-4 space-y-3">
        {shown.length > 0 && (
          <Disclosure variant="inset" summary="Charts and accuracy" open>
            <StoppedOnly label="Dyno charts">
              <Result runs={shown} units={units} />
            </StoppedOnly>
          </Disclosure>
        )}
        <Inputs garageKg={garageKg} curbKg={curbKg} demo={demo} cfg={cfg} setCfg={setCfg} radius={radius} units={units} />
        {mine.length > 0 && (
          <Disclosure variant="inset" summary={`Runs for ${profile?.name || "this car"} (${mine.length})`}>
            <StoppedOnly label="Dyno runs">
              <p className="mb-2 text-sm text-fg-faint">Tick two runs to compare them.</p>
              <ul className="divide-y divide-line">
                {mine.map((r) => (
                  <li key={r.at} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
                    <label className="flex min-h-11 items-center gap-3">
                      <input type="checkbox" className="size-5 accent-accent" checked={picked.includes(r.at)} onChange={() => toggle(r.at)} />
                      <span className="text-fg-muted">{when(r.at)}</span>
                    </label>
                    <span className="num">
                      {showPower(r.peakPower.w, units).toFixed(0)} {powerUnit(units)} @ {rpm(r.peakPower.rpm)}, {showTorque(r.peakTorque.nm, units).toFixed(0)}{" "}
                      {torqueUnit(units)} @ {rpm(r.peakTorque.rpm)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto text-danger-fg"
                      aria-label={`Delete dyno run from ${when(r.at)}`}
                      onClick={() => {
                        if (confirm(`Delete the dyno run from ${when(r.at)}?${folder === "ready" ? " Its file is removed from your folder and can't be restored." : ""}`))
                          void useDyno.getState().remove(r);
                      }}
                    >
                      Delete
                    </Button>
                  </li>
                ))}
              </ul>
              {folder !== "ready" && (
                <p className="mt-2 text-sm text-fg-faint">No folder chosen: these runs are kept until you close the app. Choose a folder in the trip log to save them.</p>
              )}
            </StoppedOnly>
          </Disclosure>
        )}
      </div>
    </Panel>
  );
}

function NumInput({ label, value, onValue, step }: { label: string; value: number; onValue: (n: number) => void; step?: string }) {
  const [text, setText] = useState(String(value));
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value); // changed elsewhere (reset, another tab): show it unless the text already means it
    if (num(text) !== value) setText(String(value));
  }
  return (
    <Field label={label}>
      <Input name={label.toLowerCase().replace(/[^a-z0-9]+/g, "-")} autoComplete="off"
        inputMode="decimal"
        step={step}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = num(e.target.value);
          if (n !== null) onValue(n);
        }}
      />
    </Field>
  );
}

function Inputs({
  garageKg,
  curbKg,
  demo,
  cfg,
  setCfg,
  radius,
  units,
}: {
  garageKg: number | null;
  curbKg: number | null;
  demo: boolean;
  cfg: ReturnType<typeof useDynoSettings>[0];
  setCfg: ReturnType<typeof useDynoSettings>[1];
  radius: number | null;
  units: UnitSystem;
}) {
  const up = (v: Partial<typeof cfg>) => setCfg({ ...cfg, ...v });
  return (
    <Disclosure
      variant="inset"
      open={curbKg === null || undefined}
      summary={`Inputs: ${curbKg === null ? "curb weight missing" : `${Math.round(curbKg + cfg.extraKg)} kg`}, losses ${cfg.losses ? "on" : "off"}`}
    >
      <StoppedOnly label="Dyno inputs">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="text-sm text-fg-muted sm:col-span-2">
            Curb weight:{" "}
            {garageKg !== null ? (
              <span className="text-fg">{garageKg} kg (Garage)</span>
            ) : demo ? (
              <span className="text-fg">{SIM_DYNO_MASS_KG} kg (demo value: the simulated car)</span>
            ) : (
              <span className="font-semibold text-warn">not set. </span>
            )}{" "}
            <Link href="/garage" className={linkClass}>
              {garageKg === null ? "Add it to the car in Garage" : "Change in Garage"}
            </Link>
            . Use the registration document&apos;s curb weight.
          </div>
          <NumInput label="Extra load: driver, passengers, cargo (kg)" value={cfg.extraKg} onValue={(n) => up({ extraKg: n })} />
          <Field
            label="Tyre size (optional, for wheel torque)"
            hint={
              cfg.tyre.trim() === ""
                ? undefined
                : radius === null
                  ? "Not a size like 205/55 R16: wheel torque is left out."
                  : `Radius ${(radius * 1000).toFixed(0)} mm (unloaded, from the size; a loaded tyre is a bit smaller).`
            }
          >
            <Input name="tyre-size" autoComplete="off" value={cfg.tyre} placeholder="e.g. 205/55 R16" onChange={(e) => up({ tyre: e.target.value })} />
          </Field>
          <Switch className="sm:col-span-2" checked={cfg.losses} onChange={(losses) => up({ losses })} label="Include rolling resistance and air drag" />
          {cfg.losses ? (
            <>
              <NumInput label="Rolling resistance coefficient (Crr)" value={cfg.crr} onValue={(n) => up({ crr: n })} />
              <NumInput label="Drag area CdA (m²)" value={cfg.cdaM2} onValue={(n) => up({ cdaM2: n })} />
              <p className="text-sm text-fg-faint sm:col-span-2">
                The starting values (Crr {EXAMPLE_CRR}, CdA {EXAMPLE_CDA_M2} m²) are typical example values for a passenger car, not your car&apos;s. Air
                density is taken as {RHO_ISA} kg/m³ (sea level, 15 °C).{" "}
                {(cfg.crr !== DEFAULT_DYNO.crr || cfg.cdaM2 !== DEFAULT_DYNO.cdaM2) && (
                  <button type="button" className={linkClass} onClick={() => up({ crr: DEFAULT_DYNO.crr, cdaM2: DEFAULT_DYNO.cdaM2 })}>
                    Reset to the example values
                  </button>
                )}
              </p>
            </>
          ) : (
            <p className="text-sm text-fg-faint sm:col-span-2">Losses off: the result is only the power used to accelerate the car&apos;s mass.</p>
          )}
          {units === "imperial" && <p className="text-sm text-fg-faint sm:col-span-2">Masses are entered in kg.</p>}
        </div>
      </StoppedOnly>
    </Disclosure>
  );
}

/** The glanceable part of a result: peak figures per shown run. */
function Peaks({ runs, units }: { runs: DynoRun[]; units: UnitSystem }) {
  return (
    <div className="mt-5 space-y-4">
      {runs.map((r, i) => {
        const force = r.curve.reduce((m, p) => (p.n > m.n ? p : m));
        const r0 = r.inputs.tyreRadiusM;
        return (
          <div key={r.at}>
            {runs.length > 1 && <SeriesKey i={i} label={when(r.at)} />}
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Power" value={showPower(r.peakPower.w, units).toFixed(0)} unit={powerUnit(units)} note={`at wheels, ${rpm(r.peakPower.rpm)} rpm`} />
              <Stat label="Torque" value={showTorque(r.peakTorque.nm, units).toFixed(0)} unit={torqueUnit(units)} note={`engine-eq., ${rpm(r.peakTorque.rpm)} rpm`} />
              {r0 ? (
                <Stat label="Wheel torque" value={showTorque(force.n * r0, units).toFixed(0)} unit={torqueUnit(units)} note={`${rpm(force.rpm)} rpm`} />
              ) : (
                <Stat label="Wheel force" value={showForce(force.n, units).toFixed(0)} unit={forceUnit(units)} note={`${rpm(force.rpm)} rpm`} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SeriesKey({ i, label }: { i: number; label: string }) {
  return (
    <div className="mb-1 flex items-center gap-2 text-sm text-fg-muted">
      <svg width="16" height="4" aria-hidden>
        <line x1="0" x2="16" y1="2" y2="2" stroke={SERIES[i]} strokeWidth="2" strokeDasharray={i === 1 ? "4 3" : undefined} />
      </svg>
      {label}
    </div>
  );
}

function Result({ runs, units }: { runs: DynoRun[]; units: UnitSystem }) {
  const series = (f: (r: DynoRun) => { pts: { rpm: number; v: number }[]; peak: { rpm: number; v: number } }): DynoSeries[] =>
    runs.map((r, i) => {
      const { pts, peak } = f(r);
      return { id: String(r.at), label: when(r.at), color: SERIES[i]!, dashed: i === 1, points: pts, peak };
    });
  const power = series((r) => ({
    pts: r.curve.map((p) => ({ rpm: p.rpm, v: showPower(p.w, units) })),
    peak: { rpm: r.peakPower.rpm, v: showPower(r.peakPower.w, units) },
  }));
  const torque = series((r) => ({
    pts: r.curve.map((p) => ({ rpm: p.rpm, v: showTorque(p.nm, units) })),
    peak: { rpm: r.peakTorque.rpm, v: showTorque(r.peakTorque.nm, units) },
  }));

  return (
    <div className="space-y-4">
      <DynoChart title="Wheel power" unit={powerUnit(units)} series={power} />
      <DynoChart title="Engine-equivalent torque" unit={torqueUnit(units)} series={torque} />

      {runs.map((r) => (
        <InputsUsed key={r.at} run={r} />
      ))}
      <p className="text-sm text-fg-muted">
        <span className="font-semibold text-fg">Accuracy.</span> The car reports engine speed in 0.25 rpm steps but vehicle speed only in
        whole km/h, so speed is worked out from engine speed and the fitted gear ratio, smoothed, then differentiated. Fewer readings per second
        mean a rougher curve. Drivetrain losses, the inertia of wheels and driveline, slope and wind are ignored, and the mass and loss values
        are only as good as what you entered. So this is roughly power at the wheels, not the engine&apos;s crank power (which is higher).
        Engine-equivalent torque is that power divided by engine speed. Use a flat, closed road and compare runs made the same way.
      </p>
    </div>
  );
}

function InputsUsed({ run: r }: { run: DynoRun }) {
  const i = r.inputs;
  return (
    <div className="rounded-control bg-surface-2 p-3 text-sm text-fg-muted">
      <p className="mb-1 font-semibold text-fg">Run {when(r.at)}: inputs used</p>
      <ul className="list-disc space-y-0.5 pl-4">
        <li>
          Mass {Math.round(i.curbKg + i.extraKg)} kg: curb {i.curbKg} kg{i.demoMass ? " (demo value)" : ""} + extra {i.extraKg} kg
        </li>
        <li>
          {i.losses
            ? `Losses: Crr ${i.losses.crr}, CdA ${i.losses.cdaM2} m², air ${i.rhoKgM3} kg/m³`
            : "Losses off: power to accelerate the mass only"}
        </li>
        {i.tyre && <li>Tyre {i.tyre}{i.tyreRadiusM ? `, radius ${(i.tyreRadiusM * 1000).toFixed(0)} mm` : " (not understood)"}</li>}
        <li>
          Gear ratio fitted from the pull: {r.kmhPer1000.toFixed(2)} km/h per 1000 rpm, every reading within {r.worstKmh.toFixed(1)} km/h of it
        </li>
        <li>
          Pull {r.durationS.toFixed(1)} s, engine speed read {r.rpmHz.toFixed(1)}×/s, vehicle speed {r.speedHz.toFixed(1)}×/s
        </li>
      </ul>
    </div>
  );
}
