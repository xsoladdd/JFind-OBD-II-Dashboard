"use client";

import Link from "next/link";
import { describeProtocol } from "@/lib/elm/protocols";
import { useConnection, type ConnStatus } from "@/lib/store/connection";

const DOT: Record<ConnStatus, string> = {
  idle: "bg-fg-faint",
  connecting: "bg-fg-muted animate-pulse",
  connected: "bg-ok",
  reconnecting: "bg-warn animate-pulse",
  error: "bg-danger",
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
    <Link
      href="/"
      title="Open the Connect screen"
      className="flex min-h-11 min-w-0 items-center gap-2 rounded-control border border-line bg-surface-1 px-3 text-sm transition-colors duration-150 hover:bg-surface-2"
      aria-live="polite"
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[status]}`} aria-hidden />
      <span className="shrink-0 font-semibold">
        {LABEL[status]}
        {mode === "demo" && status !== "idle" && <span className="ml-1 font-normal text-fg-muted">(demo)</span>}
      </span>
      {/* The Connect screen shows the protocol in full; on a phone the header keeps status and voltage. */}
      {proto && (
        <span className="hidden min-w-0 truncate text-fg-muted sm:inline" title={proto}>
          {proto}
        </span>
      )}
      {voltage && <span className="num shrink-0 text-base">{voltage}</span>}
    </Link>
  );
}
