"use client";

import type { ReactNode } from "react";
import { useEcu } from "@/lib/store/ecu";

export function Card({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4" aria-label={title}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-zinc-400">{intro}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function RunButton({ onClick, running, children }: { onClick: () => void; running: boolean; children: ReactNode }) {
  const busy = useEcu((s) => s.busy);
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="w-full rounded-md bg-sky-600 px-4 py-2.5 font-semibold hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
    >
      {running ? "Reading…" : children}
    </button>
  );
}

/** Marks a value that isn't sourced from the standard (or is a convention) and needs checking. */
export function Verify({ children = "[verify]" }: { children?: ReactNode }) {
  return <span className="rounded bg-amber-500/15 px-1 font-mono text-xs text-amber-300">{children}</span>;
}

export function ErrorText({ error }: { error: string }) {
  return error ? <p className="text-sm text-red-300">{error}</p> : null;
}

export const hex = (n: number) => `0x${n.toString(16).toUpperCase().padStart(2, "0")}`;
