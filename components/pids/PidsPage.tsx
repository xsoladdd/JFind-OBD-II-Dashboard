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
import { Button, cx, Disclosure, Field, InlineNote, Input, Panel, Select, StoppedOnly, Switch } from "@/components/ui";
import { useMounted } from "../connect/hooks";

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
    <div className="mt-3 space-y-2 rounded-control bg-bg p-3" role="status">
      <div className="text-sm text-fg-muted">Raw reply</div>
      <pre className="whitespace-pre-wrap break-all font-mono text-sm text-fg">{r.lines.length ? r.lines.join("\n") : "(nothing)"}</pre>
      {r.error ? (
        <p className="text-danger-fg">
          <span className="font-semibold">Error:</span> {r.error}
        </p>
      ) : (
        <p>
          <span className="text-fg-muted">Value:</span> <span className="num text-2xl">{+r.value!.toFixed(4)}</span> {unit}
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
    <Field label={label} hint={hint}>
      <Input className={cx(["request", "header", "prefix", "formula"].includes(key) && "font-mono")} value={d[key]} onChange={(e) => set({ [key]: e.currentTarget.value })} {...extra} />
    </Field>
  );

  return (
    <Panel title={d.isNew ? "New custom PID" : "Edit custom PID"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (problem) return;
          save(d.isNew ? [...list, pid] : list.map((p) => (p.id === pid.id ? pid : p)));
          onDone();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {field("Name", "name", { required: true })}
          {field("Unit", "unit", { placeholder: "e.g. °C, %, bar" })}
          {field("Request (hex)", "request", { placeholder: "221234", autoCapitalize: "characters", spellCheck: false }, "Mode and PID bytes, e.g. 22 1234 or 21 01.")}
          {field("Header (optional)", "header", { placeholder: "default", autoCapitalize: "characters", spellCheck: false }, "ATSH value, e.g. 7E0. Empty = the adapter's default.")}
          {field("Response prefix (optional)", "prefix", { placeholder: safePrefix(d.request) || "derived", autoCapitalize: "characters", spellCheck: false }, "Empty = mode + 0x40, then the PID bytes.")}
          {field("Formula", "formula", { required: true, spellCheck: false, autoCapitalize: "characters" }, `Bytes after the prefix are A, B, C…; + - * / ( ) & | << >> and ${FORMULA_HELPERS.map((h) => `${h}()`).join(", ")}.`)}
          {field("Min", "min", { inputMode: "decimal" })}
          {field("Max", "max", { inputMode: "decimal" })}
          <Field label="Gauge">
            <Select value={d.gauge} onChange={(e) => set({ gauge: e.currentTarget.value as GaugeType })}>
              <option value="dial">Dial</option>
              <option value="bar">Bar</option>
              <option value="number">Number</option>
            </Select>
          </Field>
          <Field label="Polling">
            <Select value={d.tier} onChange={(e) => set({ tier: e.currentTarget.value as Tier })}>
              <option value="fast">Fast (back-to-back)</option>
              <option value="medium">Medium (every 3 s)</option>
              <option value="slow">Slow (every 30 s)</option>
            </Select>
          </Field>
        </div>
        <Switch checked={d.enabled} onChange={(enabled) => set({ enabled })} label="Poll it while connected" />
        {problem && <p className="text-sm text-warn">{problem}</p>}
        {test.result?.id === pid.id && <Result r={test.result.r} unit={pid.unit} />}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="primary" disabled={!!problem}>
            Save
          </Button>
          <Button disabled={!!problem || !test.connected} loading={test.busy} onClick={() => void test.run(pid)}>
            {test.busy ? "Testing" : "Test once"}
          </Button>
          <Button onClick={onDone}>Cancel</Button>
        </div>
      </form>
    </Panel>
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
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6 md:py-8 short:py-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight short:text-2xl">PIDs</h1>
        <Button
          variant="primary"
          onClick={() => setDraft(toDraft({ ...EXAMPLE, id: newCustomId(), name: "", request: "", header: "", formula: "A", min: 0, max: 255, gauge: "number" }, true))}
        >
          New custom PID
        </Button>
      </header>
      <p className="-mt-3 max-w-prose text-fg-muted">
        Your own readings for values the OBD standard doesn&apos;t cover, such as manufacturer Mode 21/22 PIDs. You supply every definition (from your car&apos;s
        documentation or a community list); the app ships none. Enabled ones show up in the dashboard, alerts and trip logs like any other reading.
      </p>
      {note && <InlineNote role="status">{note}</InlineNote>}

      {draft && (
        <StoppedOnly label="The custom PID editor">
          <PidForm key={draft.id} draft={draft} onDone={() => setDraft(null)} />
        </StoppedOnly>
      )}

      <StoppedOnly label="The custom PID list and Test once">
        <Panel title={`Custom PIDs (${pids.length})`}>
          {!pids.length ? (
            <p className="text-fg-muted">None yet. Add one, import a list, or try the example below in Demo mode.</p>
          ) : (
            <ul className="divide-y divide-line">
              {pids.map((p) => (
                <li key={p.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Switch
                      className="min-w-0 flex-1 basis-full sm:basis-auto"
                      checked={p.enabled}
                      onChange={(enabled) => save(list.map((x) => (x.id === p.id ? { ...x, enabled } : x)))}
                      label={
                        <span className={p.enabled ? "" : "text-fg-faint"}>
                          {p.name} {p.unit && <span className="font-normal text-fg-faint">({p.unit})</span>}
                        </span>
                      }
                      description={
                        <span className="block break-all font-mono">
                          {p.header ? `ATSH ${p.header}, ` : ""}
                          {p.request} → {p.prefix || safePrefix(p.request)}, {p.formula}, {p.tier}
                        </span>
                      }
                    />
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" disabled={!test.connected || test.busy} onClick={() => void test.run(p)}>
                        Test once
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDraft(toDraft(p, false))}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger-fg"
                        onClick={() => confirm(`Delete the custom PID "${p.name}"?`) && save(list.filter((x) => x.id !== p.id))}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  {test.result?.id === p.id && <Result r={test.result.r} unit={p.unit} />}
                </li>
              ))}
            </ul>
          )}
          {mounted && !test.connected && <p className="mt-3 text-sm text-fg-faint">Connect (or start Demo mode) to use Test once.</p>}
        </Panel>
      </StoppedOnly>

      <Disclosure summary="Import and export">
        <p className="text-fg-muted">Your definitions as a JSON file, kept on this device.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button disabled={!pids.length} onClick={() => download("obd-dash-custom-pids.json", `${JSON.stringify(list, null, 2)}\n`, "application/json")}>
            Export JSON
          </Button>
          <Button onClick={() => file.current?.click()}>Import JSON</Button>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        </div>
      </Disclosure>

      <Disclosure summary="Example: works only in Demo mode">
        <p className="text-fg-muted">
          <span className="font-mono">22 1234</span> with header <span className="font-mono">7E0</span> is a made-up request that only the built-in simulator
          answers. On a real car it means nothing, or something else entirely. Use it to see how a custom PID behaves
          {mounted && !demo ? " (start Demo mode on the Connect page first)" : ""}.
        </p>
        <Button className="mt-3" onClick={() => setDraft(toDraft({ ...EXAMPLE, id: newCustomId() }, true))}>
          Fill the form with the example
        </Button>
      </Disclosure>
    </main>
  );
}
