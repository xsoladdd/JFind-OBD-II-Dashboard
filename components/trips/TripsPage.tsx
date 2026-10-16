"use client";

import Link from "next/link";
import { useConnection } from "@/lib/store/connection";
import { DynoCard } from "./DynoCard";
import { PerfTimerCard } from "./PerfTimerCard";
import { TripComputer } from "./TripComputer";
import { TripList } from "./TripList";
import { TripSettings } from "./TripSettings";
import { btn, btnPrimary, card } from "./ui";

export function TripsPage() {
  const { status, mode, connect } = useConnection();

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">Trips</h1>
        <p className="text-sm text-zinc-400">
          Trip computer, performance timer, dyno estimate and a log of every drive.{mode === "demo" && " Demo mode: all values come from the simulator."}
        </p>
      </header>

      {status !== "connected" && (
        <section className={`${card} text-sm`}>
          <p>{status === "connecting" || status === "reconnecting" ? "Connecting…" : "Not connected to an adapter."}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Link href="/" className={`${btnPrimary} px-5 py-3 text-center`}>
              Connect
            </Link>
            <button onClick={() => void connect("demo")} disabled={status === "connecting"} className={`${btn} px-5 py-3`}>
              Demo mode
            </button>
          </div>
        </section>
      )}

      <div className={`grid gap-4 ${status === "connected" ? "lg:grid-cols-2" : ""}`}>
        <TripComputer />
        {status === "connected" && <PerfTimerCard />}
      </div>
      <DynoCard />
      <TripList />
      <TripSettings />
    </main>
  );
}
