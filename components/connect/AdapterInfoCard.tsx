"use client";

import { useEffect } from "react";
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
    <section aria-labelledby="adapter-info-title" className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="adapter-info-title" className="font-semibold">
          Adapter info
        </h2>
        <button onClick={() => void refresh()} disabled={loading} className="min-h-11 px-2 text-sm text-sky-300 underline disabled:opacity-40">
          {loading ? "Reading…" : "Re-read"}
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-zinc-400">{k}</dt>
            <dd className={`break-all ${v === NOT_SUPPORTED ? "text-zinc-400" : ""}`}>{v || "—"}</dd>
          </div>
        ))}
      </dl>
      <CopyDiagnostics />
    </section>
  );
}
