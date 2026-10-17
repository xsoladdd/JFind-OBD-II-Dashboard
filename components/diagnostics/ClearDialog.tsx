"use client";

import { useEffect, useReducer, useRef } from "react";
import { Button, InlineNote, Switch } from "@/components/ui";
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
    <div className="rounded-control border border-dashed border-line-strong px-3">
      <Switch
        checked={sim.engineRunning}
        onChange={(on) => {
          setSimEngine(on);
          rerender();
        }}
        label="Demo: simulated engine running"
      />
    </div>
  );
}

const list = (codes: string[]) => codes.join(", ");

function Result({ after }: { after: Scan }) {
  if (after.stored === null || after.pending === null)
    return (
      <InlineNote tone="warn">
        The clear was acknowledged, but re-reading the codes failed ({after.errors.join("; ")}). Read codes again to confirm.
      </InlineNote>
    );
  const left = [...after.stored.map((c) => `${c} (stored)`), ...after.pending.map((c) => `${c} (pending)`)];
  return (
    <div className="space-y-3">
      {left.length === 0 ? (
        <InlineNote title="Cleared">Stored and pending codes are cleared. The check-engine light should now be off.</InlineNote>
      ) : (
        <InlineNote tone="danger">
          Codes returned or persisting: <span className="font-mono">{list(left)}</span>. The fault is probably still present.
        </InlineNote>
      )}
      {!!after.permanent?.length && (
        <p className="text-fg-muted">
          Permanent codes still present, as expected: <span className="font-mono">{list(after.permanent)}</span>. They clear on
          their own once the ECU verifies the repair over later drive cycles.
        </p>
      )}
      <p className="text-fg-muted">Readiness monitors have been reset. Drive normally and they will complete again over time.</p>
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
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overscroll-contain overflow-y-auto rounded-panel border border-line bg-surface-1 p-0 text-fg backdrop:bg-black/70"
    >
      <div className="space-y-4 p-5">
        <h2 id="clear-title" className="text-2xl font-bold tracking-tight">
          {done ? "Codes cleared" : "Clear trouble codes?"}
        </h2>

        {outcome?.status === "cleared" ? (
          <Result after={outcome.after} />
        ) : (
          <>
            <ul className="list-disc space-y-2 pl-5 text-fg-muted">
              <li>
                Erases stored and pending codes <strong>and their freeze-frame data</strong>.
              </li>
              <li>Turns off the check-engine light. It comes back if the fault is still there.</li>
              <li>
                <strong>Resets the emissions readiness monitors</strong> to incomplete. The car may fail an emissions inspection until
                it has been driven enough for them to complete again.
              </li>
              <li>
                <strong>Permanent codes (Mode 0A) can’t be cleared this way.</strong> They clear on their own once the ECU has
                verified the repair.
              </li>
            </ul>

            {live && (
              <div className="space-y-3 rounded-control bg-surface-2 p-3">
                <p className="font-medium">Export the codes first so you keep a record:</p>
                <ExportButtons scan={live} />
              </div>
            )}

            <InlineNote tone="warn" title="Engine off, key ON">
              Turn the key to <strong>ON</strong> (dashboard lights on) with the <strong>engine OFF</strong>. Engine RPM is read right
              before clearing, and clearing is blocked unless it is 0.
            </InlineNote>

            {demo && <SimEngineToggle />}

            <div aria-live="polite" className="space-y-3">
              {clearing && <p className="text-fg-muted">Checking engine RPM, clearing, then re-reading all codes…</p>}
              {outcome?.status === "blocked" && (
                <InlineNote tone="danger">
                  {outcome.reason === "engine-running"
                    ? `Blocked: the engine is running (${Math.round(outcome.rpm)} rpm). Switch the engine off, leave the key ON, then try again.`
                    : `Blocked: engine RPM couldn’t be read (${outcome.error}), so there's no way to confirm the engine is off. Check the key is ON and the adapter is connected, then try again.`}
                </InlineNote>
              )}
              {clearError && (
                <InlineNote tone="danger">
                  Clearing failed: {clearError}. The codes may not have been cleared. Read them again to check.
                </InlineNote>
              )}
            </div>
          </>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={() => ref.current?.close()} disabled={clearing}>
            {done ? "Done" : "Cancel"}
          </Button>
          {!done && (
            <Button variant="danger" onClick={() => void clear()} disabled={clearing || !connected}>
              {outcome || clearError ? "Try again" : "Check engine & clear codes"}
            </Button>
          )}
        </div>
      </div>
    </dialog>
  );
}
