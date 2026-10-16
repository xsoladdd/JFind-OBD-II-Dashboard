"use client";

import { describeProtocol } from "@/lib/elm/protocols";
import { useConnection, type ConnStatus } from "@/lib/store/connection";

const PILL: Record<ConnStatus, string> = {
  idle: "bg-zinc-700 text-zinc-200",
  connecting: "bg-sky-600/30 text-sky-200",
  connected: "bg-emerald-600/30 text-emerald-200",
  reconnecting: "bg-amber-600/30 text-amber-200",
  error: "bg-red-600/30 text-red-200",
};

export function StatusCard() {
  const s = useConnection();
  if (s.status === "idle" && !s.error) return null;
  const proto = s.protocol ? describeProtocol(s.protocol) : null;

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${PILL[s.status]}`}>
          {s.status}
        </span>
        {s.status !== "idle" && s.status !== "error" && (
          <button onClick={() => void s.disconnect()} className="rounded-md border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800">
            Disconnect
          </button>
        )}
      </div>

      {s.error && <p className="mt-3 text-sm text-red-300">{s.error}</p>}
      {s.vehicleError && (
        <p className="mt-3 text-sm text-amber-300">
          The adapter answered but the car didn&apos;t ({s.vehicleError}). Is the ignition on?
        </p>
      )}

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-zinc-400">Device</dt>
        <dd>{s.deviceName || "—"}</dd>
        <dt className="text-zinc-400">Adapter</dt>
        <dd>{s.elmVersion || "—"}</dd>
        <dt className="text-zinc-400">Protocol</dt>
        <dd>{proto ? `${proto.name}${proto.auto ? " (auto)" : ""} · ${s.protocol}` : "—"}</dd>
        <dt className="text-zinc-400">Voltage</dt>
        <dd className="flex items-center gap-3">
          <span className="font-mono">{s.voltage || "—"}</span>
          {s.status === "connected" && (
            <button onClick={() => void s.refreshVoltage()} className="text-xs text-sky-300 underline">
              refresh
            </button>
          )}
        </dd>
      </dl>
    </section>
  );
}
