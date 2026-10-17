"use client";

import { Button, Disclosure, InlineNote } from "@/components/ui";
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
      <ol className="list-decimal space-y-1.5 pl-5 text-fg-muted marker:text-fg-faint">
        {step.items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      {step.links && (
        <div className="mt-3 flex flex-wrap gap-2">
          {step.links.map((l) => (
            <Button key={l} size="sm" onClick={() => openSection(LINKS[l][1])}>
              {LINKS[l][0]}
            </Button>
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
    <Disclosure key={matched ?? "none"} open={!!matched} summary="Troubleshooting guide">
      <div className="space-y-4">
        <p className="text-fg-muted">
          General ELM327 and Web Bluetooth advice, not specific to one adapter model. Try the steps in order.
        </p>
        {first && (
          <InlineNote role="status" tone="warn" title={`Looks like: ${first.title}`}>
            <div className="mt-2">
              <StepBody step={first} />
            </div>
          </InlineNote>
        )}
        <div className="space-y-2">
          {STEPS.filter((s) => s.id !== matched).map((s) => (
            <Disclosure key={s.id} variant="inset" summary={s.title}>
              <StepBody step={s} />
            </Disclosure>
          ))}
        </div>
        {status !== "idle" && status !== "connected" && <CopyDiagnostics />}
      </div>
    </Disclosure>
  );
}
