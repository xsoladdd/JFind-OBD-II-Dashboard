"use client";

import { useLive } from "@/lib/store/live";
import { Sparkline } from "../Sparkline";
import { fmt, useDisplay } from "../live";

function Card({ id }: { id: string }) {
  const d = useDisplay(id);
  return (
    <div className="rounded-xl bg-zinc-900/70 p-3">
      <div className="truncate text-xs text-zinc-500">{d.name}</div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-zinc-50">
        {fmt(d.value, d.unit)}
        <span className="ml-1 text-xs font-normal text-zinc-500">{d.unit}</span>
      </div>
      <Sparkline points={d.live?.history ?? []} />
    </div>
  );
}

export function Minimal() {
  const supported = useLive((s) => s.supported);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {supported.map((id) => (
        <Card key={id} id={id} />
      ))}
    </div>
  );
}
