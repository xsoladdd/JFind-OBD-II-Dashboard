"use client";

import { Badge } from "@/components/ui";
import { useEcu } from "@/lib/store/ecu";
import { Card, ErrorText, Result, RunButton, Verify } from "./ui";

export function InfoCard() {
  const { info, readInfo } = useEcu();
  const d = info.data;
  const pairs = d?.ipt?.counters ?? [];

  return (
    <Card
      title="Vehicle info (Mode 09)"
      result={<Result section={info} done={<Badge tone="ok">Read</Badge>} />}
      intro="Software calibration IDs and checksums, the module's name and in-use monitor counters."
    >
      <RunButton onClick={() => void readInfo()} running={info.status === "running"}>
        Read vehicle info
      </RunButton>
      <ErrorText error={info.error} />
      {d && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-fg-muted">ECU name</dt>
          <dd className="font-mono">{d.ecuName || "not supported"}</dd>
          <dt className="text-fg-muted">Calibration IDs</dt>
          <dd className="break-all font-mono">{d.calIds.join(", ") || "not supported"}</dd>
          <dt className="text-fg-muted">CVNs</dt>
          <dd className="break-all font-mono">{d.cvns.join(", ") || "not supported"}</dd>
        </dl>
      )}
      {d?.ipt && (
        <div>
          <h3 className="font-semibold">
            In-use performance tracking (09{d.ipt.pid === 0x08 ? "08, spark ignition" : "0B, compression ignition"}){" "}
            <Verify>counter names [verify]</Verify>
          </h3>
          <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {pairs.map((c) => (
              <li key={c.name} className="flex justify-between gap-2">
                <span className="text-fg-muted">{c.name}</span>
                <span className="num">{c.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
