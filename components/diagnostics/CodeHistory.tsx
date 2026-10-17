"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Disclosure, Field, Select, StoppedOnly, type Tone } from "@/components/ui";
import { download } from "@/lib/diagnostics/report";
import { historyCsv, type CodeHistory as Code, type CodeStatus } from "@/lib/diagnostics/history";
import { findProfileByVin } from "@/lib/garage/model";
import { describeDtc } from "@/lib/obd/dtc";
import { useFolder } from "@/lib/storage/folder";
import { useCodeHistory } from "@/lib/store/codeHistory";
import { useDiagnostics } from "@/lib/store/diagnostics";
import { useGarage } from "@/lib/store/garage";

const TONE: Record<CodeStatus, Tone> = {
  active: "danger",
  pending: "warn",
  permanent: "neutral",
  gone: "ok",
  unknown: "neutral",
};
const day = (t: number) => new Date(t).toLocaleDateString();
const time = (t: number) => new Date(t).toLocaleString();

function after(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 1) return "under a minute";
  if (m < 120) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
}

const statusText = (c: Code) =>
  c.status === "gone" && c.goneSince !== null ? `Gone since ${day(c.goneSince)}` : c.status[0]!.toUpperCase() + c.status.slice(1);
const link = (file: string) => `/diagnostics?scan=${encodeURIComponent(file)}`;

function Row({ c }: { c: Code }) {
  return (
    <details className="group py-3">
      <summary className="flex min-h-11 cursor-pointer list-none flex-col gap-1 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-center gap-2">
          <span translate="no" className="num text-2xl">{c.code}</span>
          <Badge tone={TONE[c.status]}>{statusText(c)}</Badge>
          {c.cameBack && <Badge tone="warn">Came back after clear</Badge>}
          <span aria-hidden className="ml-auto text-sm font-medium text-fg-faint">
            <span className="group-open:hidden">Show</span>
            <span className="hidden group-open:inline">Hide</span>
          </span>
        </span>
        <span className="text-fg-muted">{describeDtc(c.code)}</span>
        <span className="text-sm text-fg-faint">
          First {day(c.firstSeen)}, last {day(c.lastSeen)}, seen {c.timesSeen}×
        </span>
      </summary>
      <div className="mt-3 space-y-3 rounded-control bg-surface-2 p-3 text-sm">
        <p className="text-fg-muted">
          Lists over time: <span className="font-mono text-fg">{c.path.join(" → ")}</span>
        </p>
        {c.cameBack && <p className="text-warn">Returned {after(c.cameBack.afterMs)} after the last clear.</p>}
        <ol className="space-y-1 border-l border-line-strong pl-3">
          {c.events.map((e) => (
            <li key={`${e.kind}${e.at}${e.file}`}>
              <Link href={link(e.file)} className="flex min-h-11 flex-col justify-center py-1 hover:text-accent">
                <span>
                  <span className="text-fg-muted">{time(e.at)}</span>{" "}
                  {e.kind === "cleared" ? <span className="font-semibold text-ok">Codes cleared</span> : <span>in {e.lists.join(" + ")}</span>}
                </span>
                <span className="break-all font-mono text-xs text-fg-faint">{e.file}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}

export function CodeHistory() {
  const folderStatus = useFolder((s) => s.status);
  const savedAs = useDiagnostics((s) => s.savedAs);
  const { loading, error, cars, skipped, scanned, load } = useCodeHistory();
  const profiles = useGarage((s) => s.profiles);
  const loadGarage = useGarage((s) => s.load);
  const [vin, setVin] = useState("all");

  useEffect(() => {
    void load();
  }, [folderStatus, savedAs, load]);
  useEffect(() => {
    void loadGarage();
  }, [folderStatus, loadGarage]);

  const label = (v: string | null) => (v ? (findProfileByVin(profiles, v)?.name ?? v) : "No VIN");
  const shown = useMemo(
    () => cars.filter((c) => vin === "all" || (c.vin ?? "") === vin).flatMap((c) => c.codes.map((h) => ({ car: label(c.vin), h }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- label depends on profiles only
    [cars, vin, profiles],
  );

  return (
    <Disclosure
      summary={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          Code history
          {shown.length > 0 && <Badge>{shown.length}</Badge>}
        </span>
      }
    >
      {folderStatus !== "ready" ? (
        <p className="text-warn">
          Code history is built from your saved scans.{" "}
          <Link href="/history" className="underline underline-offset-4">
            Choose a folder (History page)
          </Link>{" "}
          to save scans and follow each code over time.
        </p>
      ) : (
        <StoppedOnly label="Code history">
          <div className="space-y-3">
            {error && <p className="text-danger-fg">{error}</p>}
            <div className="flex flex-wrap items-end justify-between gap-3">
              {cars.length > 1 && (
                <Field label="Car" className="min-w-52 flex-1 sm:flex-none">
                  <Select value={vin} onChange={(e) => setVin(e.target.value)}>
                    <option value="all">All cars</option>
                    {cars.map((c) => (
                      <option key={c.vin ?? ""} value={c.vin ?? ""}>
                        {label(c.vin)}
                        {c.vin && label(c.vin) !== c.vin ? ` (${c.vin})` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {shown.length > 0 && (
                <Button size="sm" onClick={() => download("obd-code-history.csv", historyCsv(shown), "text/csv")}>
                  Export CSV
                </Button>
              )}
            </div>
            {shown.length > 0 ? (
              <div className="divide-y divide-line">
                {shown.map(({ h }) => (
                  <Row key={`${h.vin}-${h.code}`} c={h} />
                ))}
              </div>
            ) : (
              !loading && (
                <p className="text-fg-muted">
                  {scanned
                    ? "No trouble codes in any saved scan yet."
                    : "No saved scans yet. History is built from saved scans: every Read codes or Clear codes run adds to it."}
                </p>
              )
            )}
            {loading && <p className="text-fg-faint">Reading saved scans…</p>}
            {skipped > 0 && (
              <p className="text-sm text-fg-faint">
                {skipped} file{skipped === 1 ? "" : "s"} in the scans folder skipped (damaged, or not OBD Dash scans).
              </p>
            )}
          </div>
        </StoppedOnly>
      )}
    </Disclosure>
  );
}
