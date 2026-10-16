"use client";

import { FolderCard } from "@/components/storage/FolderCard";
import { useFolder } from "@/lib/storage/folder";
import { useConnection } from "@/lib/store/connection";
import { CompatBanner } from "./CompatBanner";
import { DebugConsole } from "./DebugConsole";
import { useHasBluetooth } from "./hooks";
import { StatusCard } from "./StatusCard";
import { UuidSettings } from "./UuidSettings";

const STEPS = [
  "Plug the JF327 adapter into the car's OBD-II port (usually under the dashboard, driver's side).",
  "Turn the ignition on. The engine can stay off.",
  "Tap Connect.",
  "Pick the adapter in the browser's device list.",
];

export function ConnectScreen() {
  const hasBt = useHasBluetooth();
  const { status, connect } = useConnection();
  const busy = status === "connecting" || status === "reconnecting";
  const start = (mode: "ble" | "demo") => {
    void connect(mode); // first, so the Bluetooth chooser gets this tap's user gesture
    // The tap is a gesture too: use it to ask for the folder again (browsers forget the grant between visits).
    const folder = useFolder.getState();
    if (folder.status === "needs-permission") void folder.regrant();
  };

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">OBD Dash</h1>
        <p className="text-sm text-zinc-400">Live engine data from an ELM327 Bluetooth adapter. Everything stays on this device.</p>
      </header>

      <CompatBanner />

      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-300">
          {STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => start("ble")}
            disabled={!hasBt || busy}
            className="rounded-md bg-sky-600 px-5 py-3 font-semibold hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Connect
          </button>
          <button
            onClick={() => start("demo")}
            disabled={busy}
            className="rounded-md border border-zinc-600 px-5 py-3 font-semibold hover:bg-zinc-800 disabled:opacity-40"
          >
            Demo mode
          </button>
        </div>
      </section>

      <StatusCard />
      <FolderCard />
      <DebugConsole />
      <UuidSettings />
    </main>
  );
}
