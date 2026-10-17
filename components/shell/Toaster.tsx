"use client";

import { IconButton } from "@/components/ui";
import { dismissToast, useToasts, type ToastKind } from "@/lib/store/toasts";

const STYLE: Record<ToastKind, string> = {
  error: "border-l-danger",
  warn: "border-l-warn",
  info: "border-l-accent",
};

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex flex-col items-center gap-2 px-4 md:left-auto md:right-4 md:items-end short:top-14 short:left-auto short:right-4 short:items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-control border border-l-4 border-line bg-surface-2 py-1 pr-1 pl-4 text-[15px] text-fg shadow-xl shadow-black/40 ${STYLE[t.kind]}`}
        >
          <span className="flex-1 py-2">{t.text}</span>
          <IconButton label="Dismiss" size="sm" onClick={() => dismissToast(t.id)}>
            ✕
          </IconButton>
        </div>
      ))}
    </div>
  );
}
