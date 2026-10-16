"use client";

import { useEffect, useState } from "react";
import { FolderCard } from "@/components/storage/FolderCard";
import { useFolder } from "@/lib/storage/folder";
import { useUnits } from "@/lib/store/settings";
import { removeSavedTrip, useTrips } from "@/lib/store/trips";
import { readCsv } from "@/lib/trips/files";
import type { TripSummary } from "@/lib/trips/format";
import { Replay } from "./Replay";
import { btn, card, disp, fmtDuration } from "./ui";

interface Row {
  base: string;
  summary: TripSummary;
  /** In memory: this session's last trip, not (yet) in the folder. */
  csv?: string;
  unsaved?: boolean;
}

/** Past trips, newest first, each opening a replay. */
export function TripList() {
  const { last, saved } = useTrips();
  const folder = useFolder((s) => s.status);
  const [units] = useUnits();
  const [open, setOpen] = useState<string | null>(null);

  const rows: Row[] = [...(saved ?? [])];
  if (last && !rows.some((r) => r.base === last.base)) rows.unshift({ ...last, unsaved: !last.saved });

  const del = async (r: Row) => {
    if (!confirm(`Delete the trip from ${new Date(r.summary.startedAt).toLocaleString()}? Both files are removed from your folder and can't be restored.`))
      return;
    try {
      await removeSavedTrip(r.base);
      if (open === r.base) setOpen(null);
    } catch (e) {
      alert(`Couldn't delete it: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <section className={card} aria-label="Trip log">
      <h2 className="mb-3 font-semibold">Trip log</h2>
      {folder !== "ready" && (
        <div className="mb-3 space-y-2">
          <p className="text-sm font-medium text-amber-200">Choose a folder to save trips.</p>
          <p className="text-xs text-zinc-400">
            The trip computer works without one, but trips are only kept until you close the tab.
          </p>
          <FolderCard />
        </div>
      )}
      {!rows.length && <p className="text-sm text-zinc-400">No trips yet. Each drive is recorded automatically while connected.</p>}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.base} className="rounded-md border border-zinc-800">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="font-medium">{new Date(r.summary.startedAt).toLocaleString()}</span>
              <span className="text-zinc-400">
                {r.summary.endedAt === null
                  ? "not finished (the app closed during this trip)"
                  : `${disp(r.summary.distanceKm, "km", units, 1).join(" ")} · ${fmtDuration(r.summary.durationS * 1000)}`}
              </span>
              {r.unsaved && <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-300">not saved</span>}
              <span className="ml-auto flex gap-2">
                <button className={btn} onClick={() => setOpen(open === r.base ? null : r.base)} aria-expanded={open === r.base}>
                  {open === r.base ? "Close" : "Replay"}
                </button>
                {!r.unsaved && (
                  <button className={`${btn} text-red-300`} onClick={() => void del(r)} aria-label={`Delete trip from ${new Date(r.summary.startedAt).toLocaleString()}`}>
                    Delete
                  </button>
                )}
              </span>
            </div>
            {open === r.base && (
              <div className="border-t border-zinc-800 p-3">
                <TripReplay row={r} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TripReplay({ row }: { row: Row }) {
  const [csv, setCsv] = useState<string | null | undefined>(row.csv);
  useEffect(() => {
    if (row.csv !== undefined) return;
    readCsv(row.base).then(setCsv, () => setCsv(null));
  }, [row.base, row.csv]);
  if (csv === undefined) return <p className="text-sm text-zinc-400">Loading…</p>;
  if (csv === null) return <p className="text-sm text-zinc-400">The sample file ({row.base}.csv) is missing or unreadable.</p>;
  return <Replay summary={row.summary} csv={csv} />;
}
