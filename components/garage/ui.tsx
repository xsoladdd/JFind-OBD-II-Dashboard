import type { ReactNode } from "react";

export const card = "rounded-lg border border-zinc-800 bg-zinc-900 p-4";
export const input = "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm";
export const btn = "rounded-md border border-zinc-600 px-3 py-2 text-sm font-semibold hover:bg-zinc-800 disabled:opacity-40";
export const btnPrimary = "rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold hover:bg-sky-500 disabled:opacity-40";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs text-zinc-400">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

/** "" → null, otherwise a finite number ≥ 0 (or null if it isn't one). */
export const num = (s: string): number | null => {
  const n = s.trim() === "" ? NaN : Number(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
export const str = (n: number | null) => (n === null ? "" : String(n));
