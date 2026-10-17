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
import { AlertBanner } from "@/components/dashboard/DriveBanners";
import { Badge, Button, Disclosure, Field, Input, Panel, Select, StoppedOnly, Switch } from "@/components/ui";
import { useMounted } from "../connect/hooks";

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
    <Panel title={d.id ? "Edit rule" : "New rule"}>
      <form
        className="space-y-4"
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Value" className="sm:col-span-2">
            <Select name="value" value={d.pid} onChange={(e) => set({ pid: e.currentTarget.value })}>
              {(ids.includes(d.pid) ? ids : [d.pid, ...ids]).map((id) => (
                <option key={id} value={id}>
                  {liveDef(id)?.name ?? id}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="When it goes">
            <Select name="when-it-goes" value={d.op} onChange={(e) => set({ op: e.currentTarget.value as AlertRule["op"] })}>
              <option value="above">Above</option>
              <option value="below">Below</option>
            </Select>
          </Field>
          <Field label={`Threshold (${shown})`}>
            <Input name="threshold" autoComplete="off" inputMode="decimal" required value={d.threshold} onChange={(e) => set({ threshold: e.currentTarget.value })} />
          </Field>
          <Field label={`Hysteresis (${shown})`} hint="How far back it must come before the alert clears, so it doesn't flap.">
            <Input name="hysteresis" autoComplete="off" inputMode="decimal" value={d.hysteresis} onChange={(e) => set({ hysteresis: e.currentTarget.value })} />
          </Field>
          <Field label="Minimum duration (s)" hint="How long it must stay past the threshold. Ignores one-sample spikes.">
            <Input name="minimum-duration" autoComplete="off" inputMode="decimal" value={d.durationS} onChange={(e) => set({ durationS: e.currentTarget.value })} />
          </Field>
        </div>
        <Switch checked={d.enabled} onChange={(enabled) => set({ enabled })} label="Enabled" />
        {!valid && <p className="text-sm text-warn">Enter a threshold. Hysteresis and duration can&apos;t be negative.</p>}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="primary" disabled={!valid}>
            Save rule
          </Button>
          <Button onClick={onDone}>Cancel</Button>
        </div>
      </form>
    </Panel>
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

  const firing = mounted ? active.length : 0;
  const on = mounted ? rules.filter((r) => r.enabled).length : 0;
  const until = useAlerts((s) => s.mutedUntil);
  const newRule = () => setDraft({ id: null, pid: ids[0] ?? "010C", op: "above", threshold: "", hysteresis: "0", durationS: "0", enabled: true });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8 short:py-4">
      <h1 className="text-3xl font-bold tracking-tight short:text-2xl">Alerts</h1>

      <section aria-label="Alert status" className="space-y-4">
        {mounted && <AlertBanner />}
        {!(firing && !muted) && (
          <div>
            <p className="text-3xl font-bold" aria-live="polite">
              {mounted && muted ? "Muted" : firing ? `${firing} firing` : "No alerts firing"}
            </p>
            <p className="mt-1 text-lg text-fg-muted">
              {mounted && muted
                ? `${firing ? `${firing} firing. ` : ""}Sound and vibration are off until ${new Date(until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
                : mounted && !connected
                  ? "Not connected right now: rules start when you connect."
                  : `${on} of ${mounted ? rules.length : 0} rules on.`}
            </p>
          </div>
        )}
        {mounted && muted ? (
          <Button size="drive" className="w-full short:max-w-xl" onClick={unmute}>
            Unmute
          </Button>
        ) : (
          <div role="group" aria-labelledby="mute-for" className="short:max-w-xl">
            <p id="mute-for" className="mb-2 text-lg font-semibold">
              Mute for
            </p>
            <div className="grid grid-cols-3 gap-4">
              {MUTE_MINUTES.map((m) => (
                <Button key={m} size="drive" className="px-2" aria-label={`Mute ${m} min`} onClick={() => mute(m)}>
                  {m} min
                </Button>
              ))}
            </div>
          </div>
        )}
      </section>

      <StoppedOnly label="Your rules and the rule editor">
        <div className="space-y-6">
          {draft && <RuleForm key={draft.id ?? "new" + draft.pid + draft.threshold} draft={draft} ids={ids} onDone={() => setDraft(null)} />}

          <Panel
            title="Your rules"
            action={
              <Button variant="primary" size="sm" onClick={newRule}>
                New rule
              </Button>
            }
          >
            {!mounted || rules.length === 0 ? (
              <p className="text-fg-muted">No rules yet. Create one, or start from an example below.</p>
            ) : (
              <ul className="divide-y divide-line">
                {rules.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <Switch
                      className="min-w-0 flex-1 basis-full sm:basis-0"
                      checked={r.enabled}
                      onChange={(enabled) => saveRules(rules.map((x) => (x.id === r.id ? { ...x, enabled } : x)))}
                      label={
                        <span className={r.enabled ? "" : "text-fg-faint"}>
                          {describeRule(r)}
                          {active.some((a) => a.rule.id === r.id) && (
                            <Badge tone="danger" className="ml-2">
                              Firing
                            </Badge>
                          )}
                        </span>
                      }
                      description={
                        <>
                          hysteresis {round(deltaToDisplay(r.hysteresis, unitOf(r.pid), units))} {toDisplay(0, unitOf(r.pid), units).unit}, for {r.durationS} s
                          {mounted && connected && !supported.includes(r.pid) && ", not supported by this car"}
                        </>
                      }
                    />
                    <div className="ml-auto flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setDraft(toDraft(r, r.id, units))}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger-fg"
                        onClick={() => confirm(`Delete the rule “${describeRule(r)}”?`) && saveRules(rules.filter((x) => x.id !== r.id))}
                      >
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Disclosure summary="Examples: adjust for your car">
            <p className="text-fg-muted">
              These numbers are placeholders, not the right values for your car [verify]. Normal ranges differ per engine and battery. Picking one only fills
              in the form; nothing runs until you save it.
            </p>
            <ul className="mt-3 divide-y divide-line">
              {examples(redline).map(({ label, rule }) => (
                <li key={label} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{label}</span>{" "}
                    <span className="text-fg-muted">({mounted ? describeRule({ ...rule, id: "" }) : ""} [verify])</span>
                  </span>
                  <Button size="sm" onClick={() => setDraft(toDraft(rule, null, units))}>
                    Use as a starting point
                  </Button>
                </li>
              ))}
            </ul>
          </Disclosure>
        </div>
      </StoppedOnly>

      <p className="max-w-prose text-sm text-fg-faint">
        Your own rules, checked on every page while the adapter is connected. A firing rule shows a message, beeps and vibrates where the phone supports it.
      </p>
    </main>
  );
}
