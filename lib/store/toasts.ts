import { create } from "zustand";
import { useConnection } from "./connection";

export type ToastKind = "error" | "warn" | "info";
export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

export const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));
let nextId = 0;

export function dismissToast(id: number) {
  useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

function push(kind: ToastKind, text: string, ms = kind === "error" ? 8000 : 5000) {
  if (useToasts.getState().toasts.some((t) => t.text === text)) return; // same message already showing
  const id = nextId++;
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
  setTimeout(() => dismissToast(id), ms);
}

/** Any feature can raise a toast: toast.warn("…"). The app shell renders them. */
export const toast = {
  error: (text: string) => push("error", text),
  warn: (text: string) => push("warn", text),
  info: (text: string) => push("info", text),
};

/** Toasts for connection errors, drops and reconnects. Returns the unsubscribe. */
export function watchConnection() {
  let prev = useConnection.getState();
  return useConnection.subscribe((s) => {
    if (s.status !== prev.status) {
      if (s.status === "error") toast.error(s.error || "Connection failed");
      else if (s.status === "reconnecting") toast.warn("Link to the adapter lost. Reconnecting…");
      else if (s.status === "connected" && prev.status === "reconnecting") toast.info("Reconnected");
      // A user disconnect clears mode; a drop that never came back keeps it.
      else if (s.status === "idle" && s.mode && (prev.status === "connected" || prev.status === "reconnecting"))
        toast.error("Disconnected: the adapter did not come back");
    }
    if (s.vehicleError && s.vehicleError !== prev.vehicleError)
      toast.warn(`The adapter answered but the car didn't (${s.vehicleError}). Is the ignition on?`);
    prev = s;
  });
}
