import { acquirePolling } from "../polling";
import { useAlerts, isMuted } from "../store/alerts";
import { liveDef, useLive, type LiveValue } from "../store/live";
import { getUnits } from "../store/settings";
import { toast } from "../store/toasts";
import { toDisplay } from "../units";
import { evaluate, IDLE, type AlertRule, type RuleState } from "./rules";
import { beep, buzz } from "./sound";

export type Notify = (rule: AlertRule, value: number) => void;

const show = (v: number, unit: string) => {
  const d = toDisplay(v, unit, getUnits());
  return `${d.value.toFixed(Math.abs(d.value) >= 100 ? 0 : 1)} ${d.unit}`;
};

export function describeRule(rule: AlertRule) {
  const def = liveDef(rule.pid);
  return `${def?.name ?? rule.pid} ${rule.op} ${show(rule.threshold, def?.unit ?? "")}`;
}

export const ALERT_PREFIX = "Alert: ";

const defaultNotify: Notify = (rule, value) => {
  toast.warn(`${ALERT_PREFIX}${describeRule(rule)} (now ${show(value, liveDef(rule.pid)?.unit ?? "")})`);
  beep();
  buzz();
};

/*
 * The app's one alert engine. While connected with any rule enabled it holds acquirePolling() (the Scheduler
 * already polls every supported PID plus ATRV) and evaluates each new reading. Mounted by the shell's AlertIndicator.
 */
let rules: AlertRule[] = [];
let states = new Map<string, RuleState>();
let notify: Notify = defaultNotify;
let running: { release: () => void; unsub: () => void } | null = null;

function onLive(s: { values: Record<string, LiveValue> }, prev: { values: Record<string, LiveValue> }) {
  for (const rule of rules) {
    const v = s.values[rule.pid];
    if (!v || v === prev.values[rule.pid]) continue; // no new reading for this rule
    const out = evaluate(rule, states.get(rule.id) ?? IDLE, v.value, v.t);
    states.set(rule.id, out.state);
    if (out.event === "fire") {
      useAlerts.setState((a) => ({ active: [...a.active, { rule, value: v.value, t: v.t, acked: false }] }));
      if (!isMuted(v.t)) notify(rule, v.value);
    } else if (out.event === "clear") {
      useAlerts.setState((a) => ({ active: a.active.filter((x) => x.rule.id !== rule.id) }));
    }
  }
}

/** Idempotent: call with the current rules and connection state. Keeps the state of rules that didn't change. */
export function syncAlertEngine(next: AlertRule[], connected: boolean, notifyFn: Notify = defaultNotify) {
  notify = notifyFn;
  const enabled = connected ? next.filter((r) => r.enabled) : [];
  const same = (r: AlertRule) => JSON.stringify(rules.find((o) => o.id === r.id)) === JSON.stringify(r);
  states = new Map(enabled.filter(same).flatMap((r) => (states.has(r.id) ? [[r.id, states.get(r.id)!] as const] : [])));
  rules = enabled;
  useAlerts.setState((a) => ({ active: a.active.filter((x) => states.get(x.rule.id)?.active) }));
  if (enabled.length && !running) running = { release: acquirePolling(), unsub: useLive.subscribe(onLive) };
  else if (!enabled.length && running) {
    running.unsub();
    running.release();
    running = null;
  }
}

export const stopAlertEngine = () => syncAlertEngine([], false);
