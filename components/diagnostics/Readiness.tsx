import type { MonitorState, MonitorStatus } from "@/lib/diagnostics/readiness";

const CHIP: Record<MonitorState, string> = {
  complete: "bg-emerald-600/25 text-emerald-200",
  incomplete: "bg-amber-600/25 text-amber-200",
  unsupported: "bg-zinc-800 text-zinc-400",
};

/** One readiness set. For 0141 "available" means "enabled this drive cycle", hence the label switch. */
export function Readiness({ title, pid, status, cycle }: { title: string; pid: string; status: MonitorStatus | null; cycle?: boolean }) {
  const supported = status?.monitors.filter((m) => m.state !== "unsupported") ?? [];
  const done = supported.filter((m) => m.state === "complete").length;
  const label = (s: MonitorState) => (s === "unsupported" ? (cycle ? "not enabled" : "not supported") : s);

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="font-semibold">
        {title} <span className="font-mono text-xs text-zinc-500">{pid}</span>
      </h3>
      {!status ? (
        <p className="mt-2 text-sm text-zinc-400">Not available: the car didn&apos;t report it.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-zinc-400">
            {status.ignition === "spark" ? "Spark ignition" : "Compression ignition"} monitors · {done}/{supported.length} complete
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {status.monitors.map((m) => (
              <li key={m.name} className="flex items-center justify-between gap-3">
                <span className={m.state === "unsupported" ? "text-zinc-500" : ""}>{m.name}</span>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${CHIP[m.state]}`}>{label(m.state)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
