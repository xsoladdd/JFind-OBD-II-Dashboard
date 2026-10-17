"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./Button";

/**
 * Modal sheet on a native <dialog>: focus trap, Escape to close and a backdrop tap come with it. Slides up from the
 * bottom on a portrait phone, centred on wider or landscape screens. Focus goes back to the opener on close.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const id = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", ""); // very old browsers: no modality, still usable
    } else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onClose={() => {
        onClose();
        if (opener.current instanceof HTMLElement) opener.current.focus();
      }}
      // A tap on the backdrop lands on the dialog element itself, not on its content.
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      className="m-0 mt-auto max-h-[85dvh] w-full overscroll-contain max-w-none overflow-y-auto rounded-t-panel border border-b-0 border-line bg-surface-1 p-0 text-fg backdrop:bg-black/70 short:m-auto short:max-w-md short:rounded-panel short:border-b md:m-auto md:max-w-md md:rounded-panel md:border-b"
    >
      <div className="flex items-center justify-between gap-3 py-2 pr-2 pl-4 sm:pl-5">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {/* First focusable element: the dialog focuses it when it opens. */}
        <Button variant="ghost" size="sm" onClick={() => ref.current?.close()}>
          Close
        </Button>
      </div>
      <div className="px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{children}</div>
    </dialog>
  );
}
