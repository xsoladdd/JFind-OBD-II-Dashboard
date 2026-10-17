"use client";

import { useEffect, useState } from "react";
import { FolderCard } from "@/components/storage/FolderCard";
import { useFolder } from "@/lib/storage/folder";
import { useUnits } from "@/lib/store/settings";
import { removeSavedTrip, useTrips } from "@/lib/store/trips";
import { readCsv } from "@/lib/trips/files";
import type { TripSummary } from "@/lib/trips/format";
import { Replay } from "./Replay";
import { Badge, Button, Disclosure, InlineNote, StoppedOnly } from "@/components/ui";
import { disp, fmtDuration } from "./format";

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
    <Disclosure id="trip-log" summary={`Trip log (${rows.length})`}>
      <StoppedOnly label="Trip log and replay">
        {folder !== "ready" && (
          <div className="mb-4 space-y-3">
            <InlineNote tone="warn" title="Choose a folder to save trips.">
              The trip computer works without one, but trips are only kept until you close the tab.
            </InlineNote>
            <FolderCard />
          </div>
        )}
        {!rows.length && <p className="text-fg-muted">No trips yet. Each drive is recorded automatically while connected.</p>}
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.base} className="rounded-control border border-line">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                <div className="min-w-0">
                  <p className="font-semibold">{new Date(r.summary.startedAt).toLocaleString()}</p>
                  <p className="text-sm text-fg-muted">
                    {r.summary.endedAt === null ? (
                      "not finished (the app closed during this trip)"
                    ) : (
                      <span className="num text-base">
                        {disp(r.summary.distanceKm, "km", units, 1).join(" ")}, {fmtDuration(r.summary.durationS * 1000)}
                      </span>
                    )}
                  </p>
                </div>
                {r.unsaved && <Badge tone="warn">Not saved</Badge>}
                <span className="ml-auto flex gap-2">
                  <Button size="sm" onClick={() => setOpen(open === r.base ? null : r.base)} aria-expanded={open === r.base}>
                    {open === r.base ? "Close" : "Replay"}
                  </Button>
                  {!r.unsaved && (
                    <Button variant="danger" size="sm" onClick={() => void del(r)} aria-label={`Delete trip from ${new Date(r.summary.startedAt).toLocaleString()}`}>
                      Delete
                    </Button>
                  )}
                </span>
              </div>
              {open === r.base && (
                <div className="border-t border-line p-3">
                  <TripReplay row={r} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </StoppedOnly>
    </Disclosure>
  );
}

function TripReplay({ row }: { row: Row }) {
  const [csv, setCsv] = useState<string | null | undefined>(row.csv);
  useEffect(() => {
    if (row.csv !== undefined) return;
    readCsv(row.base).then(setCsv, () => setCsv(null));
  }, [row.base, row.csv]);
  if (csv === undefined) return <p className="text-fg-muted">Loading…</p>;
  if (csv === null) return <p className="text-fg-muted">The sample file ({row.base}.csv) is missing or unreadable.</p>;
  return <Replay summary={row.summary} csv={csv} />;
}
