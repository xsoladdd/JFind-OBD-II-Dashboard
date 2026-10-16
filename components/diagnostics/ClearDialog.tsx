"use client";

import { useEffect, useReducer, useRef } from "react";
import type { Scan } from "@/lib/diagnostics/scan";
import { getClient, useConnection } from "@/lib/store/connection";
import { useDiagnostics } from "@/lib/store/diagnostics";
import { SimulatorTransport } from "@/lib/transport/SimulatorTransport";
import { ExportButtons } from "./ExportButtons";

const simulator = () => {
  const t = getClient()?.transport;
  return t instanceof SimulatorTransport ? t.emulator : null;
};

const setSimEngine = (on: boolean) => {
  const sim = simulator();
  if (sim) sim.engineRunning = on;
};

/** Demo only: lets the simulated car sit at key ON, engine OFF so the Mode 04 flow can complete. */
function SimEngineToggle() {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const sim = simulator();
  if (!sim) return null;
  return (
    <label className="flex items-center gap-3 rounded-md border border-dashed border-zinc-700 p-3 text-sm">
      <input
        type="checkbox"
        className="size-5 accent-sky-500"
        checked={sim.engineRunning}
        onChange={(e) => {
          setSimEngine(e.target.checked);
          rerender();
        }}
      />
      Demo: simulated engine running
    </label>
  );
}

const list = (codes: string[]) => codes.join(", ");

function Result({ after }: { after: Scan }) {
  if (after.stored === null || after.pending === null)
    return (
      <p className="rounded-md bg-amber-600/20 p-3 text-amber-100">
        The clear was acknowledged, but re-reading the codes failed ({after.errors.join("; ")}). Read codes again to confirm.
      </p>
    );
  const left = [...after.stored.map((c) => `${c} (stored)`), ...after.pending.map((c) => `${c} (pending)`)];
  return (
    <div className="space-y-3">
      {left.length === 0 ? (
        <p className="rounded-md bg-emerald-600/20 p-3 text-emerald-100">
          Stored and pending codes are cleared. The check-engine light should now be off.
        </p>
      ) : (
        <p className="rounded-md bg-red-600/20 p-3 text-red-100">
          Codes returned or persisting: <span className="font-mono">{list(left)}</span>. The fault is probably still present.
        </p>
      )}
      {!!after.permanent?.length && (
        <p className="text-zinc-300">
          Permanent codes still present, as expected: <span className="font-mono">{list(after.permanent)}</span>. They clear on
          their own once the ECU verifies the repair over later drive cycles.
        </p>
      )}
      <p className="text-zinc-400">Readiness monitors have been reset. Drive normally and they will complete again over time.</p>
    </div>
  );
}

/** Mode 04 confirmation. The engine-off check and the re-read run in clearCodes (lib/diagnostics/scan.ts). */
export function ClearDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { live, clearing, outcome, clearError, clear, resetClear } = useDiagnostics();
  const connected = useConnection((s) => s.status === "connected");
  const demo = useConnection((s) => s.mode === "demo");
  const done = outcome?.status === "cleared";

  useEffect(() => {
    const d = ref.current;
    if (open && !d?.open) d?.showModal();
    if (!open && d?.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="clear-title"
      onCancel={(e) => clearing && e.preventDefault()}
      onClose={() => {
        resetClear();
        onClose();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-0 text-zinc-100 backdrop:bg-black/70"
    >
      <div className="space-y-4 p-5 text-sm">
        <h2 id="clear-title" className="text-xl font-bold">
          {done ? "Codes cleared" : "Clear trouble codes?"}
        </h2>

        {outcome?.status === "cleared" ? (
          <Result after={outcome.after} />
        ) : (
          <>
            <ul className="list-disc space-y-1.5 pl-5 text-zinc-300">
              <li>
                Erases stored and pending codes <strong>and their freeze-frame data</strong>.
              </li>
              <li>Turns off the check-engine light. It comes back if the fault is still there.</li>
              <li>
                <strong>Resets the emissions readiness monitors</strong> to incomplete. The car may fail an emissions inspection until
                it has been driven enough for them to complete again.
              </li>
              <li>
                <strong>Permanent codes (Mode 0A) can&apos;t be cleared this way.</strong> They clear on their own once the ECU has
                verified the repair.
              </li>
            </ul>

            {live && (
              <div className="space-y-2 rounded-md bg-zinc-800/60 p-3">
                <p className="font-medium">Export the codes first so you keep a record:</p>
                <ExportButtons scan={live} />
              </div>
            )}

            <p className="rounded-md bg-amber-600/20 p-3 text-amber-100">
              Turn the key to <strong>ON</strong> (dashboard lights on) with the <strong>engine OFF</strong>. Engine RPM is read right
              before clearing, and clearing is blocked unless it is 0.
            </p>

            {demo && <SimEngineToggle />}

            <div aria-live="polite">
              {clearing && <p className="text-sky-200">Checking engine RPM, clearing, then re-reading all codes…</p>}
              {outcome?.status === "blocked" && (
                <p className="rounded-md bg-red-600/20 p-3 text-red-100">
                  {outcome.reason === "engine-running"
                    ? `Blocked: the engine is running (${Math.round(outcome.rpm)} rpm). Switch the engine off, leave the key ON, then try again.`
                    : `Blocked: engine RPM couldn't be read (${outcome.error}), so there's no way to confirm the engine is off. Check the key is ON and the adapter is connected, then try again.`}
                </p>
              )}
              {clearError && (
                <p className="rounded-md bg-red-600/20 p-3 text-red-100">
                  Clearing failed: {clearError}. The codes may not have been cleared. Read them again to check.
                </p>
              )}
            </div>
          </>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={() => ref.current?.close()}
            disabled={clearing}
            className="rounded-md border border-zinc-600 px-5 py-3 font-semibold hover:bg-zinc-800 disabled:opacity-40"
          >
            {done ? "Done" : "Cancel"}
          </button>
          {!done && (
            <button
              onClick={() => void clear()}
              disabled={clearing || !connected}
              className="rounded-md bg-red-600 px-5 py-3 font-semibold hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {outcome || clearError ? "Try again" : "Check engine & clear codes"}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
