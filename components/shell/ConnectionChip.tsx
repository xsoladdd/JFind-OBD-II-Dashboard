"use client";

import { describeProtocol } from "@/lib/elm/protocols";
import { useConnection, type ConnStatus } from "@/lib/store/connection";

const DOT: Record<ConnStatus, string> = {
  idle: "bg-zinc-500",
  connecting: "bg-sky-400 animate-pulse",
  connected: "bg-emerald-400",
  reconnecting: "bg-amber-400 animate-pulse",
  error: "bg-red-500",
};
const LABEL: Record<ConnStatus, string> = {
  idle: "Not connected",
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  error: "Error",
};

/** Status, protocol and ATRV voltage, shown on every page. */
export function ConnectionChip() {
  const status = useConnection((s) => s.status);
  const protocol = useConnection((s) => s.protocol);
  const voltage = useConnection((s) => s.voltage);
  const mode = useConnection((s) => s.mode);
  const proto = protocol ? describeProtocol(protocol).name : "";

  return (
    <div className="flex min-w-0 items-center gap-2 text-xs sm:text-sm" aria-live="polite">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[status]}`} aria-hidden />
      <span className="shrink-0 font-semibold">
        {LABEL[status]}
        {mode === "demo" && status !== "idle" && <span className="ml-1 font-normal text-zinc-400">(demo)</span>}
      </span>
      {proto && (
        <span className="min-w-0 truncate text-zinc-400" title={proto}>
          {proto}
        </span>
      )}
      {voltage && <span className="shrink-0 font-mono tabular-nums text-zinc-200">{voltage}</span>}
    </div>
  );
}
