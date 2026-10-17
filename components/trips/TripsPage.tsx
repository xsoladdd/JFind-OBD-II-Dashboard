"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, buttonClass } from "@/components/ui";
import { useConnection } from "@/lib/store/connection";
import { DynoCard } from "./DynoCard";
import { PerfTimerCard } from "./PerfTimerCard";
import { TripComputer } from "./TripComputer";
import { TripList } from "./TripList";
import { TripSettings } from "./TripSettings";

/**
 * Drive-first: the live trip on top (state word, big figures), then the timer and dyno with one big Arm each. The trip
 * log and the settings are behind a disclosure and a sheet, and locked while moving (DESIGN.md "Driving").
 */
export function TripsPage() {
  const { status, mode, connect } = useConnection();
  const [settings, setSettings] = useState(false);
  const connected = status === "connected";

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6 md:py-8 short:py-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight short:text-2xl">Trips</h1>
          {mode === "demo" && <Badge title="All values come from the simulator">Demo</Badge>}
        </div>
        <Button aria-haspopup="dialog" aria-expanded={settings} onClick={() => setSettings(true)}>
          Trip settings
        </Button>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-2 short:grid-cols-2">
        <div className="space-y-6">
          <TripComputer />
          {!connected && (
            <div className="space-y-3">
              {(status === "connecting" || status === "reconnecting") && (
                <p className="text-lg text-fg-muted" role="status">
                  Connecting…
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2 short:grid-cols-1">
                <Link href="/" className={buttonClass("primary", "drive")}>
                  Connect
                </Link>
                <Button size="drive" onClick={() => void connect("demo")} disabled={status === "connecting"}>
                  Demo mode
                </Button>
              </div>
            </div>
          )}
        </div>
        <div className="space-y-6">
          {connected && <PerfTimerCard />}
          <DynoCard />
        </div>
      </div>

      <TripList />
      <TripSettings open={settings} onClose={() => setSettings(false)} />
    </main>
  );
}
