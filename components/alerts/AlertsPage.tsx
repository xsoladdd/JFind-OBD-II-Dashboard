"use client";

import { useState } from "react";
import { describeRule } from "@/lib/alerts/engine";
import { deltaFromDisplay, deltaToDisplay, examples, fromDisplay, type AlertRule } from "@/lib/alerts/rules";
import { newId } from "@/lib/dashboard/layouts";
import { PID_LIST } from "@/lib/obd/pids";
import { MUTE_MINUTES, useAlerts } from "@/lib/store/alerts";
import { useConnection } from "@/lib/store/connection";
import { ATRV, liveDef, useLive } from "@/lib/store/live";
import { useAlertRules, useCustomPids, useRedline, useUnits } from "@/lib/store/settings";
import { toDisplay, type UnitSystem } from "@/lib/units";
import { StoppedOnly } from "@/components/ui";
import { useMounted } from "../connect/hooks";

const card = "rounded-xl border border-zinc-800 bg-zinc-900 p-4";
const input = "w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100";
const ALL_IDS = [...PID_LIST.map((p) => p.id), ATRV.id];

/** The form works in the user's units as strings (so partial input like "-" or "1." survives typing). */
interface Draft {
  id: string | null; // null = new rule
  pid: string;
  op: AlertRule["op"];
  threshold: string;
  hysteresis: string;
  durationS: string;
  enabled: boolean;
}

const round = (n: number) => String(Math.round(n * 100) / 100);
const unitOf = (pid: string) => liveDef(pid)?.unit ?? "";

function toDraft(r: Omit<AlertRule, "id">, id: string | null, units: UnitSystem): Draft {
  const u = unitOf(r.pid);
  return {
    id,
    pid: r.pid,
    op: r.op,
    threshold: round(toDisplay(r.threshold, u, units).value),
    hysteresis: round(deltaToDisplay(r.hysteresis, u, units)),
    durationS: String(r.durationS),
    enabled: r.enabled,
  };
}

function RuleForm({ draft, onDone, ids }: { draft: Draft; onDone: () => void; ids: string[] }) {
  const [units] = useUnits();
  const [rules, saveRules] = useAlertRules();
  const [d, setD] = useState(draft);
  const u = unitOf(d.pid);
  const shown = toDisplay(0, u, units).unit;
  const threshold = Number(d.threshold);
  const hysteresis = Number(d.hysteresis || 0);
  const durationS = Number(d.durationS || 0);
  const valid = d.threshold.trim() !== "" && Number.isFinite(threshold) && hysteresis >= 0 && durationS >= 0;
  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch });

  return (
    <form
      className={`${card} space-y-3`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        const rule: AlertRule = {
          id: d.id ?? newId(),
          pid: d.pid,
          op: d.op,
          threshold: fromDisplay(threshold, u, units),
          hysteresis: deltaFromDisplay(hysteresis, u, units),
          durationS,
          enabled: d.enabled,
        };
        saveRules(d.id ? rules.map((r) => (r.id === d.id ? rule : r)) : [...rules, rule]);
        onDone();
      }}
    >
      <h2 className="font-semibold">{d.id ? "Edit rule" : "New rule"}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm text-zinc-400 sm:col-span-2">
          <span>Value</span>
          <select className={input} value={d.pid} onChange={(e) => set({ pid: e.currentTarget.value })}>
            {(ids.includes(d.pid) ? ids : [d.pid, ...ids]).map((id) => (
              <option key={id} value={id}>
                {liveDef(id)?.name ?? id}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm text-zinc-400">
          <span>When it goes</span>
          <select className={input} value={d.op} onChange={(e) => set({ op: e.currentTarget.value as AlertRule["op"] })}>
            <option value="above">Above</option>
            <option value="below">Below</option>
          </select>
        </label>
        <label className="space-y-1 text-sm text-zinc-400">
          <span>Threshold ({shown})</span>
          <input className={input} inputMode="decimal" required value={d.threshold} onChange={(e) => set({ threshold: e.currentTarget.value })} />
        </label>
        <label className="space-y-1 text-sm text-zinc-400">
          <span>Hysteresis ({shown})</span>
          <input className={input} inputMode="decimal" value={d.hysteresis} onChange={(e) => set({ hysteresis: e.currentTarget.value })} />
          <span className="block text-xs text-zinc-500">How far back it must come before the alert clears, so it doesn&apos;t flap.</span>
        </label>
        <label className="space-y-1 text-sm text-zinc-400">
          <span>Minimum duration (s)</span>
          <input className={input} inputMode="decimal" value={d.durationS} onChange={(e) => set({ durationS: e.currentTarget.value })} />
          <span className="block text-xs text-zinc-500">How long it must stay past the threshold. Ignores one-sample spikes.</span>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={d.enabled} onChange={(e) => set({ enabled: e.currentTarget.checked })} className="h-4 w-4" />
        Enabled
      </label>
      {!valid && <p className="text-sm text-amber-300">Enter a threshold. Hysteresis and duration can&apos;t be negative.</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={!valid} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold hover:bg-sky-500 disabled:opacity-40">
          Save rule
        </button>
        <button type="button" onClick={onDone} className="rounded-md border border-zinc-600 px-4 py-2 text-sm hover:bg-zinc-800">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function AlertsPage() {
  const mounted = useMounted();
  const [rules, saveRules] = useAlertRules();
  const [units] = useUnits();
  const [redline] = useRedline();
  const supported = useLive((s) => s.supported);
  const connected = useConnection((s) => s.status === "connected");
  const active = useAlerts((s) => s.active);
  const muted = useAlerts((s) => s.mutedUntil > 0);
  const { mute, unmute } = useAlerts.getState();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [customPids] = useCustomPids();
  // Status / enum PIDs (liveDef(id).text) can't have thresholds.
  const ids = (supported.length ? supported : [...ALL_IDS, ...customPids.filter((c) => c.enabled).map((c) => c.id)]).filter((id) => !liveDef(id)?.text);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4">
      <div>
        <h1 className="text-xl font-semibold">Alerts</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Your own rules, checked on every page while the adapter is connected. A firing rule shows a message, beeps and vibrates where the phone supports it.
          {mounted && !connected && " Not connected right now: rules start when you connect."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {mounted && muted ? (
          <>
            <span className="text-zinc-300">🔕 Muted</span>
            <button onClick={unmute} className="rounded-md border border-zinc-600 px-3 py-1.5 hover:bg-zinc-800">
              Unmute
            </button>
          </>
        ) : (
          MUTE_MINUTES.map((m) => (
            <button key={m} onClick={() => mute(m)} className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800">
              Mute {m} min
            </button>
          ))
        )}
        <button
          onClick={() => setDraft({ id: null, pid: ids[0] ?? "010C", op: "above", threshold: "", hysteresis: "0", durationS: "0", enabled: true })}
          className="ml-auto rounded-md bg-sky-600 px-4 py-2 font-semibold hover:bg-sky-500"
        >
          New rule
        </button>
      </div>

      {draft && (
        <StoppedOnly label="The alert rule editor">
          <RuleForm key={draft.id ?? "new" + draft.pid + draft.threshold} draft={draft} ids={ids} onDone={() => setDraft(null)} />
        </StoppedOnly>
      )}

      <section className={card}>
        <h2 className="font-semibold">Your rules</h2>
        {!mounted || rules.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-400">No rules yet. Create one, or start from an example below.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-800">
            {rules.map((r) => {
              const firing = active.some((a) => a.rule.id === r.id);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <label className="flex min-w-0 flex-1 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={(e) => saveRules(rules.map((x) => (x.id === r.id ? { ...x, enabled: e.currentTarget.checked } : x)))}
                      className="h-5 w-5 shrink-0"
                      aria-label={`Enable: ${describeRule(r)}`}
                    />
                    <span className="min-w-0">
                      <span className={`block ${r.enabled ? "" : "text-zinc-500"}`}>
                        {describeRule(r)}
                        {firing && <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold">firing</span>}
                      </span>
                      <span className="block text-xs text-zinc-500">
                        hysteresis {round(deltaToDisplay(r.hysteresis, unitOf(r.pid), units))} {toDisplay(0, unitOf(r.pid), units).unit} · for {r.durationS} s
                        {mounted && connected && !supported.includes(r.pid) && " · not supported by this car"}
                      </span>
                    </span>
                  </label>
                  <button className="text-sm text-sky-300 underline" onClick={() => setDraft(toDraft(r, r.id, units))}>
                    Edit
                  </button>
                  <button className="text-sm text-red-300 underline" onClick={() => confirm(`Delete the rule "${describeRule(r)}"?`) && saveRules(rules.filter((x) => x.id !== r.id))}>
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="font-semibold">Examples: adjust for your car</h2>
        <p className="mt-1 text-sm text-zinc-400">
          These numbers are placeholders, not the right values for your car [verify]. Normal ranges differ per engine and battery. Picking one only fills in the form; nothing runs until you save it.
        </p>
        <ul className="mt-3 space-y-2">
          {examples(redline).map(({ label, rule }) => (
            <li key={label} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{label}</span>{" "}
                <span className="text-zinc-400">
                  ({mounted ? describeRule({ ...rule, id: "" }) : ""} [verify])
                </span>
              </span>
              <button onClick={() => setDraft(toDraft(rule, null, units))} className="rounded-md border border-zinc-600 px-3 py-1.5 hover:bg-zinc-800">
                Use as a starting point
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
