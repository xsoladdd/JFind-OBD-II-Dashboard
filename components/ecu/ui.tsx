"use client";

import type { ReactNode } from "react";
import { Badge, Button, Disclosure, InlineNote, StoppedOnly } from "@/components/ui";
import { useEcu, type Section } from "@/lib/store/ecu";

/**
 * One test, collapsed to its title and last result. Tests are multi-step ELM operations with technical output, so the
 * body is parked-only (DESIGN.md §12).
 */
export function Card({ title, result, intro, children }: { title: string; result: ReactNode; intro: ReactNode; children: ReactNode }) {
  return (
    <Disclosure
      summary={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {title}
          {result}
        </span>
      }
    >
      <StoppedOnly label={title}>
        <div className="space-y-4">
          <p className="text-fg-muted">{intro}</p>
          {children}
        </div>
      </StoppedOnly>
    </Disclosure>
  );
}

/** The word a test's summary shows: not run, reading, failed, or `done` once it has a result. */
export function Result({ section, done }: { section: Pick<Section<unknown>, "status">; done: ReactNode }) {
  if (section.status === "running") return <Badge tone="accent">Reading…</Badge>;
  if (section.status === "error") return <Badge tone="danger">Error</Badge>;
  if (section.status === "done") return done;
  return <Badge>Not run</Badge>;
}

export function RunButton({ onClick, running, children }: { onClick: () => void; running: boolean; children: ReactNode }) {
  const busy = useEcu((s) => s.busy);
  return (
    <Button variant="primary" onClick={onClick} disabled={busy} className="w-full sm:w-auto">
      {running ? "Reading…" : children}
    </Button>
  );
}

/** Marks a value that isn’t sourced from the standard (or is a convention) and needs checking. */
export function Verify({ children = "[verify]" }: { children?: ReactNode }) {
  return (
    <Badge tone="warn" className="font-mono">
      {children}
    </Badge>
  );
}

export function ErrorText({ error }: { error: string }) {
  return error ? <InlineNote tone="danger">{error}</InlineNote> : null;
}

export const hex = (n: number) => `0x${n.toString(16).toUpperCase().padStart(2, "0")}`;
