"use client";

import Link from "next/link";
import { useConnection } from "@/lib/store/connection";
import { BatteryCard } from "./BatteryCard";
import { InfoCard } from "./InfoCard";
import { Mode06Card } from "./Mode06Card";
import { PerEcuCard } from "./PerEcuCard";

export function EcuScreen() {
  const { status, mode, connect } = useConnection();

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">Advanced diagnostics</h1>
        <p className="text-sm text-zinc-400">
          Monitor tests, codes per module, vehicle info and a battery check. For standard code reads, freeze frame and
          clearing, see{" "}
          <Link href="/diagnostics" className="text-sky-300 underline">
            Diagnostics
          </Link>
          .{mode === "demo" && " Demo mode: all values come from the simulator."}
        </p>
      </header>

      {status !== "connected" ? (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm">
          <p>{status === "connecting" || status === "reconnecting" ? "Connecting…" : "Not connected to an adapter."}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Link href="/" className="rounded-md bg-sky-600 px-5 py-3 text-center font-semibold hover:bg-sky-500">
              Connect
            </Link>
            <button
              onClick={() => void connect("demo")}
              disabled={status === "connecting"}
              className="rounded-md border border-zinc-600 px-5 py-3 font-semibold hover:bg-zinc-800 disabled:opacity-40"
            >
              Demo mode
            </button>
          </div>
        </section>
      ) : (
        <>
          <Mode06Card />
          <PerEcuCard />
          <InfoCard />
          <BatteryCard />
        </>
      )}
    </main>
  );
}
