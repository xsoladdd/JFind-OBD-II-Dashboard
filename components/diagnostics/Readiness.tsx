import { Badge, type Tone } from "@/components/ui";
import type { MonitorState, MonitorStatus } from "@/lib/diagnostics/readiness";

const TONE: Record<MonitorState, Tone> = { complete: "ok", incomplete: "warn", unsupported: "neutral" };

/** [complete, supported] monitors of one readiness set. */
export function readyCount(status: MonitorStatus | null): [number, number] {
  const supported = status?.monitors.filter((m) => m.state !== "unsupported") ?? [];
  return [supported.filter((m) => m.state === "complete").length, supported.length];
}

/** One readiness set. For 0141 "available" means "enabled this drive cycle", hence the label switch. */
export function Readiness({ title, pid, status, cycle }: { title: string; pid: string; status: MonitorStatus | null; cycle?: boolean }) {
  const [done, total] = readyCount(status);
  const label = (s: MonitorState) => (s === "unsupported" ? (cycle ? "not enabled" : "not supported") : s);

  return (
    <section>
      <h3 className="font-semibold">
        {title} <span className="font-mono text-sm text-fg-faint">{pid}</span>
      </h3>
      {!status ? (
        <p className="mt-2 text-fg-muted">Not available: the car didn’t report it.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-fg-muted">
            {status.ignition === "spark" ? "Spark ignition" : "Compression ignition"} monitors: <span className="num">{done}/{total}</span>{" "}
            complete
          </p>
          <ul className="mt-3 space-y-2">
            {status.monitors.map((m) => (
              <li key={m.name} className="flex items-center justify-between gap-3">
                <span className={m.state === "unsupported" ? "text-fg-faint" : ""}>{m.name}</span>
                <Badge tone={TONE[m.state]} className="shrink-0">
                  {label(m.state)}
                </Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
