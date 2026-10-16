"use client";

import { midName, type MonitorTest } from "@/lib/ecu/mode06";
import { useEcu } from "@/lib/store/ecu";
import { Card, ErrorText, hex, RunButton, Verify } from "./ui";

const num = (v: number) => String(+v.toFixed(4));

function TestRow({ t }: { t: MonitorTest }) {
  const unit = t.unit ?? "";
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-t border-zinc-800 py-2 text-sm first:border-t-0">
      <span className="font-mono text-zinc-300">
        TID {hex(t.tid)}
        {t.unit === null && (
          <span className="ml-2">
            <Verify>UASID {hex(t.uasid)} raw [verify]</Verify>
          </span>
        )}
      </span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.pass ? "bg-emerald-600/30 text-emerald-200" : "bg-red-600/30 text-red-200"}`}>
        {t.pass ? "PASS" : "FAIL"}
      </span>
      <span className="col-span-2 font-mono text-xs text-zinc-400">
        value <span className="text-zinc-100">{num(t.value)} {unit}</span> · min {num(t.min)} · max {num(t.max)}
      </span>
    </li>
  );
}

export function Mode06Card() {
  const { mode06, readMode06 } = useEcu();
  const tests = mode06.data?.tests ?? [];
  const mids = [...new Set(tests.map((t) => t.mid))];
  const failed = tests.filter((t) => !t.pass).length;

  return (
    <Card
      title="Mode 06: on-board monitor tests"
      intro="The latest result of each self-test the engine computer ran, with the limits it judged it against. A FAIL here can show up before a code is set."
    >
      <RunButton onClick={() => void readMode06()} running={mode06.status === "running"}>
        Read test results
      </RunButton>
      <ErrorText error={mode06.error} />
      {mode06.data?.raw && (
        <div className="text-sm">
          <p className="text-amber-300">
            This car isn&apos;t on CAN. Older protocols use a different Mode 06 format (test IDs with manufacturer-defined
            units and no UASID), so the reply is shown raw and not decoded. <Verify />
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-black p-2 font-mono text-xs">{mode06.data.raw.join("\n")}</pre>
        </div>
      )}
      {mode06.status === "done" && !mode06.data?.raw && (
        <p className="text-sm">
          {tests.length} tests across {mids.length} monitors ·{" "}
          <span className={failed ? "text-red-300" : "text-emerald-300"}>{failed} failed</span>
        </p>
      )}
      {mids.map((mid) => (
        <div key={mid} className="rounded-md border border-zinc-800 px-3 py-2">
          <h3 className="text-sm font-semibold">
            {midName(mid)} <span className="font-mono text-xs text-zinc-500">MID {hex(mid)}</span>
          </h3>
          <ul>
            {tests
              .filter((t) => t.mid === mid)
              .map((t) => (
                <TestRow key={`${t.mid}-${t.tid}`} t={t} />
              ))}
          </ul>
        </div>
      ))}
    </Card>
  );
}
