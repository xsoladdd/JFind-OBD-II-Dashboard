"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { download } from "@/lib/diagnostics/report";
import { historyCsv, type CodeHistory as Code, type CodeStatus } from "@/lib/diagnostics/history";
import { findProfileByVin } from "@/lib/garage/model";
import { describeDtc } from "@/lib/obd/dtc";
import { useFolder } from "@/lib/storage/folder";
import { useCodeHistory } from "@/lib/store/codeHistory";
import { useDiagnostics } from "@/lib/store/diagnostics";
import { useGarage } from "@/lib/store/garage";

const CARD = "rounded-lg border border-zinc-800 bg-zinc-900 p-4";
const BADGE: Record<CodeStatus, string> = {
  active: "bg-red-600/25 text-red-200",
  pending: "bg-amber-600/25 text-amber-200",
  permanent: "bg-fuchsia-600/25 text-fuchsia-200",
  gone: "bg-emerald-600/25 text-emerald-200",
  unknown: "bg-zinc-700 text-zinc-300",
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
    <details className="group py-2.5">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-base font-semibold">{c.code}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE[c.status]}`}>{statusText(c)}</span>
          {c.cameBack && <span className="rounded-full bg-sky-600/25 px-2.5 py-0.5 text-xs text-sky-200">Came back after clear</span>}
          <span className="ml-auto text-xs text-zinc-500 group-open:rotate-90">▸</span>
        </div>
        <p className="mt-1 text-sm text-zinc-300">{describeDtc(c.code)}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          First {day(c.firstSeen)} · last {day(c.lastSeen)} · seen {c.timesSeen}×
        </p>
      </summary>
      <div className="mt-2 space-y-2 rounded-md bg-zinc-950/60 p-3 text-sm">
        <p className="text-zinc-400">
          Lists over time: <span className="font-mono text-zinc-200">{c.path.join(" → ")}</span>
        </p>
        {c.cameBack && (
          <p className="text-sky-200">Returned {after(c.cameBack.afterMs)} after the last clear.</p>
        )}
        <ol className="space-y-1.5 border-l border-zinc-700 pl-3">
          {c.events.map((e) => (
            <li key={`${e.kind}${e.at}${e.file}`}>
              <Link href={link(e.file)} className="block hover:text-sky-200">
                <span className="text-zinc-400">{time(e.at)}</span>{" "}
                {e.kind === "cleared" ? (
                  <span className="font-semibold text-emerald-300">Codes cleared</span>
                ) : (
                  <span>in {e.lists.join(" + ")}</span>
                )}
                <span className="block break-all font-mono text-xs text-zinc-500">{e.file}</span>
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
    <section className={`${CARD} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Code history</h2>
        {shown.length > 0 && (
          <button
            onClick={() => download("obd-code-history.csv", historyCsv(shown), "text/csv")}
            className="rounded-md border border-zinc-600 px-3 py-2 text-sm font-medium hover:bg-zinc-800"
          >
            Export CSV
          </button>
        )}
      </div>

      {folderStatus !== "ready" ? (
        <p className="text-sm text-amber-200">
          Code history is built from your saved scans.{" "}
          <Link href="/history" className="underline">
            Choose a folder (History page)
          </Link>{" "}
          to save scans and follow each code over time.
        </p>
      ) : (
        <>
          {error && <p className="text-sm text-red-300">{error}</p>}
          {cars.length > 1 && (
            <label className="flex flex-col gap-1 text-sm text-zinc-400 sm:flex-row sm:items-center sm:gap-2">
              Car
              <select
                value={vin}
                onChange={(e) => setVin(e.target.value)}
                className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              >
                <option value="all">All cars</option>
                {cars.map((c) => (
                  <option key={c.vin ?? ""} value={c.vin ?? ""}>
                    {label(c.vin)}
                    {c.vin && label(c.vin) !== c.vin ? ` (${c.vin})` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {shown.length > 0 ? (
            <div className="divide-y divide-zinc-800">
              {shown.map(({ h }) => (
                <Row key={`${h.vin}-${h.code}`} c={h} />
              ))}
            </div>
          ) : (
            !loading && (
              <p className="text-sm text-zinc-400">
                {scanned
                  ? "No trouble codes in any saved scan yet."
                  : "No saved scans yet. History is built from saved scans: every Read codes or Clear codes run adds to it."}
              </p>
            )
          )}
          {loading && <p className="text-sm text-zinc-500">Reading saved scans…</p>}
          {skipped > 0 && (
            <p className="text-xs text-zinc-500">
              {skipped} file{skipped === 1 ? "" : "s"} in the scans folder skipped (damaged, or not OBD Dash scans).
            </p>
          )}
        </>
      )}
    </section>
  );
}
