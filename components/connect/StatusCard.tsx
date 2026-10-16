"use client";

import Link from "next/link";
import { Badge, Button, buttonClass, InlineNote, NO_VALUE, panelClass, Stat, type Tone } from "@/components/ui";
import { describeProtocol } from "@/lib/elm/protocols";
import { useConnection, type ConnStatus } from "@/lib/store/connection";

const TONE: Record<ConnStatus, Tone> = {
  idle: "neutral",
  connecting: "neutral",
  connected: "ok",
  reconnecting: "warn",
  error: "danger",
};

export function StatusCard() {
  const s = useConnection();
  if (s.status === "idle" && !s.error) return null;
  const proto = s.protocol ? describeProtocol(s.protocol) : null;
  const active = s.status !== "idle" && s.status !== "error";

  return (
    <section className={`${panelClass} p-4 sm:p-5`} aria-live="polite" aria-labelledby="status-title">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Badge tone={TONE[s.status]} className="uppercase">
            {s.status}
          </Badge>
          <h2 id="status-title" className="mt-2 truncate text-2xl font-semibold">
            {s.deviceName || "No adapter"}
          </h2>
          <p className="text-fg-muted">{s.elmVersion || "Adapter version unknown"}</p>
        </div>
        <Stat
          label="Voltage"
          value={s.voltage?.replace(/\s*V$/i, "")}
          unit="V"
          size="lg"
          className="shrink-0 text-right"
          note={
            s.status === "connected" && (
              <Button variant="ghost" size="sm" className="-mr-3" onClick={() => void s.refreshVoltage()}>
                Refresh
              </Button>
            )
          }
        />
      </div>

      {s.error && (
        <InlineNote tone="danger" className="mt-4">
          {s.error}
        </InlineNote>
      )}
      {s.vehicleError && (
        <InlineNote tone="warn" className="mt-4">
          The adapter answered but the car didn&apos;t ({s.vehicleError}). Is the ignition on?
        </InlineNote>
      )}

      <dl className="mt-4 border-t border-line pt-4">
        <dt className="text-sm text-fg-muted">Protocol</dt>
        <dd className="mt-0.5 font-medium">{proto ? `${proto.name}${proto.auto ? " (auto)" : ""} · ${s.protocol}` : NO_VALUE}</dd>
      </dl>

      {active && (
        <div className="mt-5 grid grid-cols-2 gap-2 sm:flex">
          {s.status === "connected" && (
            <Link href="/dashboard" className={buttonClass("primary")}>
              Open dashboard
            </Link>
          )}
          <Button onClick={() => void s.disconnect()}>Disconnect</Button>
        </div>
      )}
    </section>
  );
}
