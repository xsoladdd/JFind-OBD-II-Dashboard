"use client";

import { FolderCard } from "@/components/storage/FolderCard";
import { Button, Panel } from "@/components/ui";
import { useFolder } from "@/lib/storage/folder";
import { useConnection } from "@/lib/store/connection";
import { AdapterInfoCard } from "./AdapterInfoCard";
import { CompatBanner } from "./CompatBanner";
import { DebugConsole } from "./DebugConsole";
import { useHasBluetooth } from "./hooks";
import { StatusCard } from "./StatusCard";
import { Troubleshooting } from "./Troubleshooting";
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
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8 short:py-4">
      <header className="mb-5 max-w-2xl short:mb-3">
        <h1 className="text-3xl font-bold tracking-tight short:text-2xl">Connect</h1>
        <p className="mt-1 text-fg-muted">Live engine data from an ELM327 Bluetooth adapter. Everything stays on this device.</p>
      </header>

      {/* Two columns once there is room, landscape phones included: the actions stay in the first one. */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start short:grid-cols-2 short:items-start">
        <div className="space-y-4">
          <CompatBanner />
          <StatusCard />
          <Panel title="How to connect">
            <ol className="list-decimal space-y-1.5 pl-5 text-fg-muted marker:font-semibold marker:text-fg-faint">
              {STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button variant="primary" onClick={() => start("ble")} disabled={!hasBt || busy}>
                Connect
              </Button>
              <Button onClick={() => start("demo")} disabled={busy}>
                Demo mode
              </Button>
            </div>
          </Panel>
          <FolderCard />
        </div>
        <div className="space-y-4">
          <AdapterInfoCard />
          <Troubleshooting />
          <DebugConsole />
          <UuidSettings />
        </div>
      </div>
    </main>
  );
}
