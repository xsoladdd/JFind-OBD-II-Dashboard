"use client";

import { useRef, useState } from "react";
import { download } from "@/lib/diagnostics/report";
import { FORMULA_HELPERS } from "@/lib/obd/formula";
import { defaultPrefix, newCustomId, sanitizeCustomPids, testCustomPid, validateCustomPid, type CustomPid } from "@/lib/obd/custom";
import type { GaugeType } from "@/lib/obd/pids";
import type { Tier } from "@/lib/polling/Scheduler";
import { withPollingPaused } from "@/lib/polling/pause";
import { getClient, useConnection } from "@/lib/store/connection";
import { useCustomPids } from "@/lib/store/settings";
import { StoppedOnly } from "@/components/ui";
import { useMounted } from "../connect/hooks";

const card = "rounded-xl border border-zinc-800 bg-zinc-900 p-4";
const input = "w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100";
const btn = "rounded-md border border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-40";

/** Not a real car's PID: the simulator answers this made-up DID (lib/sim/customPids.ts). */
const EXAMPLE: Omit<CustomPid, "id"> = {
  name: "Demo temperature (example)",
  unit: "°C",
  request: "221234",
  header: "7E0",
  prefix: "",
  formula: "(A*256+B)/10-40",
  min: -40,
  max: 160,
  gauge: "dial",
  tier: "medium",
  enabled: true,
};

type Draft = Omit<CustomPid, "min" | "max"> & { min: string; max: string; isNew: boolean };
const toDraft = (p: CustomPid, isNew: boolean): Draft => ({ ...p, min: String(p.min), max: String(p.max), isNew });
const fromDraft = (draft: Draft): CustomPid => {
  const { isNew, ...d } = draft;
  void isNew;
  return {
    ...d,
    request: d.request.replace(/\s+/g, "").toUpperCase(),
    header: d.header.replace(/\s+/g, "").toUpperCase(),
    prefix: d.prefix.replace(/\s+/g, "").toUpperCase(),
    min: d.min.trim() === "" ? NaN : Number(d.min),
    max: d.max.trim() === "" ? NaN : Number(d.max),
  };
};
const safePrefix = (req: string) => {
  try {
    return defaultPrefix(req.replace(/\s+/g, "").toUpperCase());
  } catch {
    return "";
  }
};

type TestResult = { lines: string[]; value?: number; error?: string };

/** "Test once": sends the request with live polling paused and shows the raw reply and the decoded value. */
function useTestOnce() {
  const connected = useConnection((s) => s.status === "connected");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; r: TestResult } | null>(null);
  const run = async (p: CustomPid) => {
    const client = getClient();
    if (!client) return;
    setBusy(true);
    try {
      const r = await withPollingPaused(() => testCustomPid(client, p, useConnection.getState().protocol));
      setResult({ id: p.id, r });
    } finally {
      setBusy(false);
    }
  };
  return { connected, busy, result, run };
}

function Result({ r, unit }: { r: TestResult; unit: string }) {
  return (
    <div className="mt-2 rounded-md bg-zinc-950 p-2 text-xs" role="status">
      <div className="text-zinc-500">Raw reply</div>
      <pre className="whitespace-pre-wrap break-all font-mono text-zinc-200">{r.lines.length ? r.lines.join("\n") : "(nothing)"}</pre>
      {r.error ? (
        <p className="mt-1 text-red-300">{r.error}</p>
      ) : (
        <p className="mt-1 text-emerald-300">
          Value: <span className="font-mono">{+r.value!.toFixed(4)}</span> {unit}
        </p>
      )}
    </div>
  );
}

function PidForm({ draft, onDone }: { draft: Draft; onDone: () => void }) {
  const [list, save] = useCustomPids();
  const [d, setD] = useState(draft);
  const test = useTestOnce();
  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch });
  const pid = fromDraft(d);
  const problem = validateCustomPid(pid);
  const field = (label: string, key: "name" | "unit" | "request" | "header" | "prefix" | "formula" | "min" | "max", extra: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <label className="space-y-1 text-sm text-zinc-400">
      <span>{label}</span>
      <input className={`${input} ${["request", "header", "prefix", "formula"].includes(key) ? "font-mono" : ""}`} value={d[key]} onChange={(e) => set({ [key]: e.currentTarget.value })} {...extra} />
      {hint && <span className="block text-xs text-zinc-500">{hint}</span>}
    </label>
  );

  return (
    <form
      className={`${card} space-y-3`}
      onSubmit={(e) => {
        e.preventDefault();
        if (problem) return;
        save(d.isNew ? [...list, pid] : list.map((p) => (p.id === pid.id ? pid : p)));
        onDone();
      }}
    >
      <h2 className="font-semibold">{d.isNew ? "New custom PID" : "Edit custom PID"}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("Name", "name", { required: true })}
        {field("Unit", "unit", { placeholder: "e.g. °C, %, bar" })}
        {field("Request (hex)", "request", { placeholder: "221234", autoCapitalize: "characters", spellCheck: false }, "Mode and PID bytes, e.g. 22 1234 or 21 01.")}
        {field("Header (optional)", "header", { placeholder: "default", autoCapitalize: "characters", spellCheck: false }, "ATSH value, e.g. 7E0. Empty = the adapter's default.")}
        {field("Response prefix (optional)", "prefix", { placeholder: safePrefix(d.request) || "derived", autoCapitalize: "characters", spellCheck: false }, "Empty = mode + 0x40, then the PID bytes.")}
        {field("Formula", "formula", { required: true, spellCheck: false, autoCapitalize: "characters" }, `Bytes after the prefix are A, B, C…; + - * / ( ) & | << >> and ${FORMULA_HELPERS.map((h) => `${h}()`).join(", ")}.`)}
        {field("Min", "min", { inputMode: "decimal" })}
        {field("Max", "max", { inputMode: "decimal" })}
        <label className="space-y-1 text-sm text-zinc-400">
          <span>Gauge</span>
          <select className={input} value={d.gauge} onChange={(e) => set({ gauge: e.currentTarget.value as GaugeType })}>
            <option value="dial">Dial</option>
            <option value="bar">Bar</option>
            <option value="number">Number</option>
          </select>
        </label>
        <label className="space-y-1 text-sm text-zinc-400">
          <span>Polling</span>
          <select className={input} value={d.tier} onChange={(e) => set({ tier: e.currentTarget.value as Tier })}>
            <option value="fast">Fast (back-to-back)</option>
            <option value="medium">Medium (every 3 s)</option>
            <option value="slow">Slow (every 30 s)</option>
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={d.enabled} onChange={(e) => set({ enabled: e.currentTarget.checked })} />
        Poll it while connected
      </label>
      {problem && <p className="text-sm text-amber-300">{problem}</p>}
      {test.result?.id === pid.id && <Result r={test.result.r} unit={pid.unit} />}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={!!problem} className="rounded-md bg-sky-600 px-4 py-2 font-semibold hover:bg-sky-500 disabled:opacity-40">
          Save
        </button>
        <button type="button" className={btn} disabled={!!problem || !test.connected || test.busy} onClick={() => void test.run(pid)}>
          {test.busy ? "Testing…" : "Test once"}
        </button>
        <button type="button" className={btn} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function PidsPage() {
  const mounted = useMounted();
  const [list, save] = useCustomPids();
  const demo = useConnection((s) => s.mode === "demo");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [note, setNote] = useState("");
  const test = useTestOnce();
  const file = useRef<HTMLInputElement>(null);
  const pids = mounted ? list : [];

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const parsed: unknown = JSON.parse(await f.text());
      if (!Array.isArray(parsed)) throw new Error("expected a JSON list of PID definitions");
      const ids = new Set(list.map((p) => p.id));
      const added = sanitizeCustomPids(parsed).map((p) => (ids.has(p.id) ? { ...p, id: newCustomId() } : p));
      save([...list, ...added]);
      setNote(`Imported ${added.length} custom PID${added.length === 1 ? "" : "s"}${added.length < parsed.length ? ` (${parsed.length - added.length} skipped: no request)` : ""}. Check each one before relying on it.`);
    } catch (e) {
      setNote(`Couldn't import ${f.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (file.current) file.current.value = "";
  };

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4">
      <div>
        <h1 className="text-xl font-semibold">PIDs</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Your own readings for values the OBD standard doesn&apos;t cover, such as manufacturer Mode 21/22 PIDs. You supply every definition (from your car&apos;s documentation or a community list); the app ships none. Enabled ones show up in the dashboard, alerts and trip logs like any other reading.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setDraft(toDraft({ ...EXAMPLE, id: newCustomId(), name: "", request: "", header: "", formula: "A", min: 0, max: 255, gauge: "number" }, true))}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold hover:bg-sky-500"
        >
          New custom PID
        </button>
        <button className={btn} disabled={!pids.length} onClick={() => download("obd-dash-custom-pids.json", `${JSON.stringify(list, null, 2)}\n`, "application/json")}>
          Export JSON
        </button>
        <button className={btn} onClick={() => file.current?.click()}>
          Import JSON
        </button>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
      {note && <p className="text-sm text-zinc-300" role="status">{note}</p>}

      {draft && (
        <StoppedOnly label="The custom PID editor">
          <PidForm key={draft.id} draft={draft} onDone={() => setDraft(null)} />
        </StoppedOnly>
      )}

      <StoppedOnly label="The custom PID list and Test once">
        <section className={card}>
          <h2 className="font-semibold">Custom PIDs</h2>
          {!pids.length ? (
            <p className="mt-2 text-sm text-zinc-400">None yet. Add one, import a list, or try the example below in Demo mode.</p>
          ) : (
            <ul className="mt-2 divide-y divide-zinc-800">
              {pids.map((p) => (
                <li key={p.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <label className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1">
                      <input
                        type="checkbox"
                        checked={p.enabled}
                        onChange={(e) => save(list.map((x) => (x.id === p.id ? { ...x, enabled: e.currentTarget.checked } : x)))}
                        className="h-5 w-5 shrink-0"
                        aria-label={`Poll ${p.name}`}
                      />
                      <span className="min-w-0">
                        <span className={`block ${p.enabled ? "" : "text-zinc-500"}`}>
                          {p.name} {p.unit && <span className="text-zinc-500">({p.unit})</span>}
                        </span>
                        <span className="block break-all font-mono text-xs text-zinc-500">
                          {p.header ? `ATSH ${p.header} · ` : ""}
                          {p.request} → {p.prefix || safePrefix(p.request)} · {p.formula} · {p.tier}
                        </span>
                      </span>
                    </label>
                    <button className="text-sm text-sky-300 underline disabled:opacity-40" disabled={!test.connected || test.busy} onClick={() => void test.run(p)}>
                      Test once
                    </button>
                    <button className="text-sm text-sky-300 underline" onClick={() => setDraft(toDraft(p, false))}>
                      Edit
                    </button>
                    <button className="text-sm text-red-300 underline" onClick={() => confirm(`Delete the custom PID "${p.name}"?`) && save(list.filter((x) => x.id !== p.id))}>
                      Delete
                    </button>
                  </div>
                  {test.result?.id === p.id && <Result r={test.result.r} unit={p.unit} />}
                </li>
              ))}
            </ul>
          )}
          {mounted && !test.connected && <p className="mt-2 text-xs text-zinc-500">Connect (or start Demo mode) to use Test once.</p>}
        </section>
      </StoppedOnly>

      <section className={card}>
        <h2 className="font-semibold">Example: works only in Demo mode</h2>
        <p className="mt-1 text-sm text-zinc-400">
          <span className="font-mono">22 1234</span> with header <span className="font-mono">7E0</span> is a made-up request that only the built-in simulator answers. On a real car it means nothing, or something else entirely. Use it to see how a custom PID behaves{mounted && !demo ? " (start Demo mode on the Connect page first)" : ""}.
        </p>
        <button className={`${btn} mt-3`} onClick={() => setDraft(toDraft({ ...EXAMPLE, id: newCustomId() }, true))}>
          Fill the form with the example
        </button>
      </section>
    </main>
  );
}
