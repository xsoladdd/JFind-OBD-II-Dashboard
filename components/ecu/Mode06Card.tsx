"use client";

import { Badge } from "@/components/ui";
import { midName, type MonitorTest } from "@/lib/ecu/mode06";
import { useEcu } from "@/lib/store/ecu";
import { Card, ErrorText, hex, Result, RunButton, Verify } from "./ui";

const num = (v: number) => String(+v.toFixed(4));

function TestRow({ t }: { t: MonitorTest }) {
  const unit = t.unit ?? "";
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-t border-line py-2.5 first:border-t-0">
      <span className="font-mono text-sm text-fg-muted">
        TID {hex(t.tid)}
        {t.unit === null && (
          <span className="ml-2">
            <Verify>UASID {hex(t.uasid)} raw [verify]</Verify>
          </span>
        )}
      </span>
      <Badge tone={t.pass ? "ok" : "danger"}>{t.pass ? "Pass" : "Fail"}</Badge>
      <span className="col-span-2 text-sm text-fg-muted">
        value{" "}
        <span className="num text-base text-fg">
          {num(t.value)} {unit}
        </span>
        , min <span className="num">{num(t.min)}</span>, max <span className="num">{num(t.max)}</span>
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
      title="Mode 06 monitor tests"
      result={
        <Result
          section={mode06}
          done={
            mode06.data?.raw ? (
              <Badge tone="warn">Raw reply</Badge>
            ) : failed ? (
              <Badge tone="danger">{failed} failed</Badge>
            ) : (
              <Badge tone="ok">{tests.length ? "All passed" : "No tests"}</Badge>
            )
          }
        />
      }
      intro="The latest result of each self-test the engine computer ran, with the limits it judged it against. A fail here can show up before a code is set."
    >
      <RunButton onClick={() => void readMode06()} running={mode06.status === "running"}>
        Read test results
      </RunButton>
      <ErrorText error={mode06.error} />
      {mode06.data?.raw && (
        <div className="space-y-2">
          <p className="text-warn">
            This car isn’t on CAN. Older protocols use a different Mode 06 format (test IDs with manufacturer-defined
            units and no UASID), so the reply is shown raw and not decoded. <Verify />
          </p>
          <pre className="overflow-x-auto rounded-control bg-bg p-3 font-mono text-xs text-fg-muted">{mode06.data.raw.join("\n")}</pre>
        </div>
      )}
      {mode06.status === "done" && !mode06.data?.raw && (
        <p>
          <span className="num">{tests.length}</span> tests across <span className="num">{mids.length}</span> monitors,{" "}
          <span className={failed ? "font-semibold text-danger-fg" : "font-semibold text-ok"}>{failed} failed</span>
        </p>
      )}
      {mids.map((mid) => (
        <div key={mid} className="rounded-control border border-line px-3 py-2">
          <h3 className="font-semibold">
            {midName(mid)} <span className="font-mono text-sm text-fg-faint">MID {hex(mid)}</span>
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
