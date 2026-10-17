"use client";

import { useEffect } from "react";
import { Button, NO_VALUE, Panel } from "@/components/ui";
import { NOT_SUPPORTED } from "@/lib/connect/adapterInfo";
import { captureInUse } from "@/lib/connect/profiles";
import { useAdapterInfo } from "@/lib/store/adapterInfo";
import { useConnection } from "@/lib/store/connection";
import { CopyDiagnostics } from "./CopyDiagnostics";

/** What the adapter says about itself (ATI, AT@1, ATDPN, ATRV) and which GATT characteristics are in use. */
export function AdapterInfoCard() {
  const { status, mode, deviceName, gatt, selected, writeMethod } = useConnection();
  const { info, loading, refresh, clear } = useAdapterInfo();
  const connected = status === "connected";

  useEffect(() => {
    if (connected) void refresh();
    else clear();
  }, [connected, refresh, clear]);

  if (!connected) return null;
  const demo = mode === "demo";
  const inUse = captureInUse(gatt, selected, writeMethod);
  const rows: [string, string | undefined][] = [
    ["Device", deviceName],
    ["ELM version (ATI)", info?.version],
    ["Description (AT@1)", info?.description],
    ["Protocol (ATDPN)", info?.protocol],
    ["Voltage (ATRV)", info?.voltage],
    ["GATT service", demo ? "Simulator, no Bluetooth" : inUse?.service],
    ["Notify characteristic", demo ? "Simulator, no Bluetooth" : selected?.notify],
    ["Write characteristic", demo ? "Simulator, no Bluetooth" : selected?.write],
    ["Write method", demo ? "Simulator, no Bluetooth" : writeMethod?.replace("-", " ")],
  ];

  return (
    <Panel
      title="Adapter info"
      action={
        <Button variant="ghost" size="sm" className="-mr-3" loading={loading} onClick={() => void refresh()}>
          {loading ? "Reading" : "Re-read"}
        </Button>
      }
      className="space-y-4"
    >
      <dl className="grid gap-x-4 gap-y-1 lg:grid-cols-[auto_1fr] lg:gap-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-sm text-fg-muted lg:text-base">{k}</dt>
            <dd className={`mb-2 font-medium [overflow-wrap:anywhere] lg:mb-0 ${v === NOT_SUPPORTED ? "text-fg-faint" : ""}`}>{v || NO_VALUE}</dd>
          </div>
        ))}
      </dl>
      <CopyDiagnostics />
    </Panel>
  );
}
