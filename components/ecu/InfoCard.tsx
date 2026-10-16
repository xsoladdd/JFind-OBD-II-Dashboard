"use client";

import { useEcu } from "@/lib/store/ecu";
import { Card, ErrorText, RunButton, Verify } from "./ui";

export function InfoCard() {
  const { info, readInfo } = useEcu();
  const d = info.data;
  const pairs = d?.ipt?.counters ?? [];

  return (
    <Card title="Vehicle info (Mode 09)" intro="Software calibration IDs and checksums, the module's name and in-use monitor counters.">
      <RunButton onClick={() => void readInfo()} running={info.status === "running"}>
        Read vehicle info
      </RunButton>
      <ErrorText error={info.error} />
      {d && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-zinc-400">ECU name</dt>
          <dd className="font-mono">{d.ecuName || "not supported"}</dd>
          <dt className="text-zinc-400">Calibration IDs</dt>
          <dd className="break-all font-mono">{d.calIds.join(", ") || "not supported"}</dd>
          <dt className="text-zinc-400">CVNs</dt>
          <dd className="break-all font-mono">{d.cvns.join(", ") || "not supported"}</dd>
        </dl>
      )}
      {d?.ipt && (
        <div>
          <h3 className="text-sm font-semibold">
            In-use performance tracking (09{d.ipt.pid === 0x08 ? "08, spark ignition" : "0B, compression ignition"}){" "}
            <Verify>counter names [verify]</Verify>
          </h3>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
            {pairs.map((c) => (
              <li key={c.name} className="flex justify-between gap-2">
                <span className="text-zinc-400">{c.name}</span>
                <span>{c.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
