"use client";

import { dismissToast, useToasts, type ToastKind } from "@/lib/store/toasts";

const STYLE: Record<ToastKind, string> = {
  error: "border-red-500/60 bg-red-950 text-red-100",
  warn: "border-amber-500/60 bg-amber-950 text-amber-100",
  info: "border-emerald-500/60 bg-emerald-950 text-emerald-100",
};

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-[60] flex flex-col items-center gap-2 px-4 md:left-auto md:right-4 md:items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${STYLE[t.kind]}`}
        >
          <span className="flex-1">{t.text}</span>
          <button onClick={() => dismissToast(t.id)} className="opacity-70 hover:opacity-100" aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
