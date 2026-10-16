"use client";

import { useEcu } from "@/lib/store/ecu";
import { Card, ErrorText, RunButton, Verify } from "./ui";

function Codes({ label, codes }: { label: string; codes: string[] }) {
  return (
    <>
      <dt className="text-zinc-400">{label}</dt>
      <dd className="font-mono">{codes.length ? codes.join(", ") : "none"}</dd>
    </>
  );
}

export function PerEcuCard() {
  const { perEcu, readPerEcu } = useEcu();

  return (
    <Card
      title="Codes per control module"
      intro="Turns on CAN headers (ATH1) for the query, so each code and VIN is tied to the module that reported it, then turns them off again."
    >
      <RunButton onClick={() => void readPerEcu()} running={perEcu.status === "running"}>
        Read per module
      </RunButton>
      <ErrorText error={perEcu.error} />
      {perEcu.status === "done" && !perEcu.data?.length && <p className="text-sm text-zinc-400">No module answered.</p>}
      {perEcu.data?.map((e) => (
        <div key={e.id} className="rounded-md border border-zinc-800 px-3 py-2">
          <h3 className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
            <span className="font-mono">{e.id}</span>
            <span>{e.label}</span>
            {e.name ? <span className="text-emerald-300">{e.name}</span> : e.hint && <Verify>{e.hint}</Verify>}
          </h3>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <Codes label="Stored" codes={e.stored} />
            <Codes label="Pending" codes={e.pending} />
            <Codes label="Permanent" codes={e.permanent} />
            <dt className="text-zinc-400">VIN</dt>
            <dd className="break-all font-mono">{e.vin || "not reported"}</dd>
          </dl>
        </div>
      ))}
      {perEcu.data && (
        <p className="text-xs text-zinc-500">
          Green names are the module&apos;s own Mode 09 ECU name. &quot;ECU #n&quot; is the ISO 15765-4 response ID numbering.
        </p>
      )}
    </Card>
  );
}
