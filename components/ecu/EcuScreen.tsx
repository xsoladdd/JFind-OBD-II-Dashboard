"use client";

import Link from "next/link";
import { Button, buttonClass, cx, linkClass, Panel, Stat } from "@/components/ui";
import { usePolling } from "@/lib/polling";
import { useConnection } from "@/lib/store/connection";
import { BatteryCard } from "./BatteryCard";
import { InfoCard } from "./InfoCard";
import { Mode06Card } from "./Mode06Card";
import { PerEcuCard } from "./PerEcuCard";

/** Top: the adapter voltage. Below: one collapsed section per test, its last result in the summary (parked-only inside). */
export function EcuScreen() {
  usePolling(); // keeps ATRV coming in, so the voltage below stays live
  const { status, mode, connect, voltage, refreshVoltage } = useConnection();
  const busy = status === "connecting" || status === "reconnecting";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8 short:py-4">
      <h1 className="mb-5 text-3xl font-bold tracking-tight short:mb-3 short:text-2xl">Advanced diagnostics</h1>

      {status !== "connected" ? (
        <Panel aria-live="polite" className="max-w-xl">
          <h2 className="text-balance text-5xl font-bold tracking-tight max-[23rem]:text-4xl">{busy ? "Connecting…" : "Not connected"}</h2>
          <div className="mt-5 grid gap-4">
            <Link href="/" className={buttonClass("primary", "drive")}>
              Connect
            </Link>
            <Button size="drive" onClick={() => void connect("demo")} disabled={status === "connecting"}>
              Demo mode
            </Button>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start short:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] short:items-start">
          <Panel>
            <Stat label="Adapter voltage" value={voltage.replace(/\s*V$/i, "")} unit="V" size="xl" />
            <Button variant="ghost" size="sm" className="-ml-4 mt-2" onClick={() => void refreshVoltage()}>
              Refresh
            </Button>
          </Panel>
          <div className="space-y-4">
            <Mode06Card />
            <PerEcuCard />
            <InfoCard />
            <BatteryCard />
          </div>
        </div>
      )}

      <p className="mt-6 max-w-2xl text-fg-muted">
        Monitor tests, codes per module, vehicle info and a battery check. For standard code reads, freeze frame and clearing,
        see{" "}
        <Link href="/diagnostics" className={cx(linkClass, "inline-flex min-h-11 items-center")}>
          Diagnostics
        </Link>
        .{mode === "demo" && " Demo mode: all values come from the simulator."}
      </p>
    </main>
  );
}
