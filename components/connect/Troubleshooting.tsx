"use client";

import { pickStep, STEPS, type Step } from "@/lib/connect/troubleshoot";
import { useConnection } from "@/lib/store/connection";
import { CopyDiagnostics } from "./CopyDiagnostics";
import { useHasBluetooth } from "./hooks";

/** Opens a collapsed <details> section on this page and scrolls to it. */
function openSection(id: string) {
  const el = document.getElementById(id);
  if (el instanceof HTMLDetailsElement) el.open = true;
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const LINKS = { uuids: ["Open the UUID settings", "uuid-settings"], console: ["Open the debug console", "debug-console"] } as const;

function StepBody({ step }: { step: Step }) {
  return (
    <>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-zinc-300">
        {step.items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      {step.links && (
        <div className="mt-3 flex flex-wrap gap-2">
          {step.links.map((l) => (
            <button
              key={l}
              onClick={() => openSection(LINKS[l][1])}
              className="min-h-11 rounded-md border border-zinc-600 px-3 text-sm hover:bg-zinc-800"
            >
              {LINKS[l][0]}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** Step-by-step help keyed to where the connection failed. The matching step opens by itself. */
export function Troubleshooting() {
  const hasBluetooth = useHasBluetooth();
  const { mode, status, failure, vehicleError, elmVersion, log } = useConnection();
  const matched = pickStep({ hasBluetooth, mode, status, failure, vehicleError, elmVersion, log });
  const first = STEPS.find((s) => s.id === matched);

  return (
    // Remounts when a step starts or stops matching, so the section opens or closes to fit.
    <details key={matched ?? "none"} open={!!matched} className="rounded-lg border border-zinc-800 bg-zinc-900">
      <summary className="min-h-11 cursor-pointer select-none px-4 py-3 font-semibold">Troubleshooting guide</summary>
      <div className="space-y-4 px-4 pb-4">
        <p className="text-sm text-zinc-400">
          General ELM327 and Web Bluetooth advice, not specific to one adapter model. Try the steps in order.
        </p>
        {first && (
          <div role="status" className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
            <h3 className="font-semibold text-amber-200">Looks like: {first.title}</h3>
            <StepBody step={first} />
          </div>
        )}
        <div className="space-y-2">
          {STEPS.filter((s) => s.id !== matched).map((s) => (
            <details key={s.id} className="rounded-md border border-zinc-800">
              <summary className="min-h-11 cursor-pointer select-none px-3 py-2.5 text-sm font-medium">{s.title}</summary>
              <div className="px-3 pb-3">
                <StepBody step={s} />
              </div>
            </details>
          ))}
        </div>
        {status !== "idle" && status !== "connected" && <CopyDiagnostics />}
      </div>
    </details>
  );
}
