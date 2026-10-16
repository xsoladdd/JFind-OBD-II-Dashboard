import type { ReactNode } from "react";
import { buttonClass, inputClass, panelClass } from "@/components/ui";

// Retiring: kept so pages not yet restyled still render, now drawn by the UI kit. New code imports components/ui.
export const card = `${panelClass} p-4`;
export const input = inputClass;
export const btn = buttonClass("secondary", "sm");
export const btnPrimary = buttonClass("primary", "sm");

/** Retiring: wraps its control in a <label>. New code uses Field from components/ui. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-fg-muted">
      <span className="mb-1.5 block">{label}</span>
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
